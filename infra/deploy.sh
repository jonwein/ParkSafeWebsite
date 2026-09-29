#!/bin/bash
set -euo pipefail

# Creates or updates the parksafeapp.com hosting stack (infra/site.yml) in us-east-1.
#
#   infra/deploy.sh
#
# First run: requests the TLS certificate and prints the DNS records to add in Cloudflare,
# waits until ACM has validated them, then creates the stack. Later runs update the stack in
# place. Publishing the site itself is infra/publish.sh.

STACK_NAME="${STACK_NAME:-parksafe-web}"
DOMAIN="${DOMAIN:-parksafeapp.com}"
GITHUB_REPO="${GITHUB_REPO:-jonwein/ParkSafeWebsite}"
REGION=us-east-1  # CloudFront only uses ACM certificates from us-east-1
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

aws_() { aws --region "$REGION" "$@"; }

# 1. Certificate for the domain and www, validated through DNS records in Cloudflare
CERT_ARN="$(aws_ acm list-certificates \
    --certificate-statuses ISSUED PENDING_VALIDATION \
    --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn | [0]" \
    --output text)"

if [ "$CERT_ARN" = "None" ] || [ -z "$CERT_ARN" ]; then
    echo "Requesting a certificate for $DOMAIN and www.$DOMAIN..."
    CERT_ARN="$(aws_ acm request-certificate \
        --domain-name "$DOMAIN" \
        --subject-alternative-names "www.$DOMAIN" \
        --validation-method DNS \
        --query CertificateArn --output text)"
fi

CERT_STATUS="$(aws_ acm describe-certificate --certificate-arn "$CERT_ARN" --query Certificate.Status --output text)"
if [ "$CERT_STATUS" != "ISSUED" ]; then
    # ACM fills in the validation records a few seconds after the request
    for _ in $(seq 1 12); do
        RECORDS="$(aws_ acm describe-certificate --certificate-arn "$CERT_ARN" \
            --query 'Certificate.DomainValidationOptions[].ResourceRecord.[Name,Value]' --output text)"
        [ -n "$RECORDS" ] && break
        sleep 5
    done
    echo
    echo "Add these CNAME records in Cloudflare (DNS only, not proxied):"
    echo "$RECORDS" | sort -u | while read -r name value; do
        echo "  $name  ->  $value"
    done
    echo
    # Polled here rather than with `aws acm wait certificate-validated`, which gives up after
    # 5 minutes in current CLI versions
    echo "Waiting for ACM to validate $CERT_ARN (checks every 30 seconds, up to an hour)..."
    for _ in $(seq 1 120); do
        CERT_STATUS="$(aws_ acm describe-certificate --certificate-arn "$CERT_ARN" --query Certificate.Status --output text)"
        [ "$CERT_STATUS" != "PENDING_VALIDATION" ] && break
        sleep 30
    done
    if [ "$CERT_STATUS" != "ISSUED" ]; then
        echo "Certificate is $CERT_STATUS, not ISSUED. Check the records above, then run this script again." >&2
        exit 1
    fi
fi
echo "Certificate: $CERT_ARN"

# 2. Keep the WAF web ACL that subscribing to a CloudFront flat-rate plan attaches.
#    The template can't know about it, and leaving it out would try to detach it.
WEB_ACL_ARN=""
DISTRIBUTION_ID="$(aws_ cloudformation describe-stacks --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue | [0]" \
    --output text 2>/dev/null || true)"
if [ -n "$DISTRIBUTION_ID" ] && [ "$DISTRIBUTION_ID" != "None" ]; then
    WEB_ACL_ARN="$(aws cloudfront get-distribution-config --id "$DISTRIBUTION_ID" \
        --query DistributionConfig.WebACLId --output text)"
    [ "$WEB_ACL_ARN" = "None" ] && WEB_ACL_ARN=""
fi

# 3. Stack
aws_ cloudformation deploy \
    --stack-name "$STACK_NAME" \
    --template-file "$SCRIPT_DIR/site.yml" \
    --capabilities CAPABILITY_IAM \
    --no-fail-on-empty-changeset \
    --parameter-overrides \
        "DomainName=$DOMAIN" \
        "CertificateArn=$CERT_ARN" \
        "GitHubRepo=$GITHUB_REPO" \
        "WebAclArn=$WEB_ACL_ARN"

output() {
    aws_ cloudformation describe-stacks --stack-name "$STACK_NAME" \
        --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" --output text
}

echo
echo "Stack $STACK_NAME is up to date."
echo "  Bucket:        $(output BucketName)"
echo "  Distribution:  $(output DistributionId)  ($(output DistributionDomainName))"
echo "  Deploy role:   $(output DeployRoleArn)"
echo
echo "Let GitHub Actions publish on pushes to main:"
echo "  gh variable set AWS_DEPLOY_ROLE_ARN --body '$(output DeployRoleArn)'"
echo "  gh variable set SITE_BUCKET --body '$(output BucketName)'"
echo "  gh variable set DISTRIBUTION_ID --body '$(output DistributionId)'"
