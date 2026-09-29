import { holidayName, type AspDay } from '../../lib/restrictions/asp';
import { formatType } from '../../lib/restrictions/sign';
import { formatLocation, formatStatus, formatStreet, formatWindow } from './format';
import type { Pole, PoleSign } from './poles';

interface Props {
  pole: Pole;
  aspToday: AspDay | undefined;
  onClose: () => void;
}

export function PoleDetails({ pole, aspToday, onClose }: Props) {
  const count = pole.signs.length;
  return (
    <section class="details" aria-labelledby="details-title">
      <header class="panel-head">
        <div>
          <h2 id="details-title">{count === 1 ? 'Sign at this spot' : `${count} signs at this spot`}</h2>
          <p class="muted">{formatLocation(pole.signs[0].sign.properties)}</p>
        </div>
        <button type="button" class="icon-button" onClick={onClose} aria-label="Close sign details">
          ×
        </button>
      </header>
      <ul class="sign-list">
        {pole.signs.map((poleSign) => (
          <SignCard key={poleSign.sign.id} poleSign={poleSign} aspToday={aspToday} />
        ))}
      </ul>
      <p class="fine-print">
        Always read the posted signs: they can change before the city's data does. Sign data from NYC DOT, updated
        daily.
      </p>
    </section>
  );
}

function SignCard({ poleSign, aspToday }: { poleSign: PoleSign; aspToday: AspDay | undefined }) {
  const { sign, status, color } = poleSign;
  const p = sign.properties;
  const aspSuspended = sign.category === 'StreetCleaning' && aspToday?.status === 'suspended';
  const meta = [p.arrow_direction && `Arrow points ${p.arrow_direction.toLowerCase()}`, p.sign_code]
    .filter(Boolean)
    .join(' · ');

  return (
    <li class="sign-card">
      <div class="sign-card-head">
        <span class={`dot dot-${color}`} aria-hidden="true" />
        <h3>{formatType(sign.category)}</h3>
        {p.time_limit_minutes ? <span class="tag">{formatLimit(p.time_limit_minutes)} limit</span> : null}
      </div>
      <p class={`status status-${color}`}>{formatStatus(status, p.special_conditions)}</p>
      <ul class="windows">
        {sign.windows.map((window, i) => (
          <li key={i}>{formatWindow(window)}</li>
        ))}
      </ul>
      {p.special_conditions?.length ? (
        <p class="note">Applies to {p.special_conditions.map((c) => formatStreet(c).toLowerCase()).join(', ')}</p>
      ) : null}
      {aspSuspended ? (
        <p class="note note-good">
          Alternate side parking is suspended today{aspToday?.exceptionName ? ` (${holidayName(aspToday.exceptionName)})` : ''}.
        </p>
      ) : null}
      {p.sign_description ? <p class="sign-text">{p.sign_description}</p> : null}
      {meta ? <p class="fine-print">{meta}</p> : null}
    </li>
  );
}

function formatLimit(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60}-hour` : `${minutes}-minute`;
}
