#!/bin/bash
set -euo pipefail

# Uploads the built site (dist/) to S3 and clears CloudFront's cache.
#
#   npm run build && infra/publish.sh
#
# Takes the bucket and distribution from SITE_BUCKET and DISTRIBUTION_ID (as GitHub Actions
# sets them), or else from the parksafe-web stack's outputs.

STACK_NAME="${STACK_NAME:-parksafe-web}"
REGION=us-east-1
DIST_DIR="$(cd "$(dirname "$0")/.." && pwd)/dist"

output() {
    aws --region "$REGION" cloudformation describe-stacks --stack-name "$STACK_NAME" \
        --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" --output text
}

SITE_BUCKET="${SITE_BUCKET:-$(output BucketName)}"
DISTRIBUTION_ID="${DISTRIBUTION_ID:-$(output DistributionId)}"

if [ ! -f "$DIST_DIR/index.html" ]; then
    echo "No build found in $DIST_DIR; run npm run build first." >&2
    exit 1
fi

# The app's invite links need this file. A build that lost it (GitHub's artifact upload drops
# hidden folders unless told not to) would publish without it and quietly break them.
AASA=".well-known/apple-app-site-association"
if [ ! -f "$DIST_DIR/$AASA" ]; then
    echo "$DIST_DIR/$AASA is missing; invite links would stop opening the app." >&2
    exit 1
fi

# Fingerprinted assets never change, so browsers keep them for a year. Old ones are left in
# place for pages still open on the previous build.
if [ -d "$DIST_DIR/_astro" ]; then
    aws s3 sync "$DIST_DIR/_astro" "s3://$SITE_BUCKET/_astro" \
        --cache-control "public,max-age=31536000,immutable"
fi

# Everything else: browsers revalidate on every visit; CloudFront keeps a copy for a day,
# and the invalidation below replaces it on every publish.
aws s3 sync "$DIST_DIR" "s3://$SITE_BUCKET" \
    --delete \
    --exclude "_astro/*" \
    --cache-control "public,max-age=0,s-maxage=86400"

# Apple fetches this to verify the app's invite links. It has no extension, so name its type.
aws s3 cp "$DIST_DIR/$AASA" "s3://$SITE_BUCKET/$AASA" \
    --content-type application/json \
    --cache-control "public,max-age=0,s-maxage=86400"

INVALIDATION_ID="$(aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/*" \
    --query Invalidation.Id --output text)"

echo "Published to s3://$SITE_BUCKET; CloudFront invalidation $INVALIDATION_ID is clearing the cache."
