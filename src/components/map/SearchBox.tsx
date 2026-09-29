import { useEffect, useRef, useState } from 'preact/hooks';
import { loadSearchHistory, saveToSearchHistory, searchPlaces, type Place } from '../../lib/geosearch';

interface Props {
  onSelect: (place: Place) => void;
}

export function SearchBox({ onSelect }: Props) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [history, setHistory] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [failed, setFailed] = useState(false);
  const container = useRef<HTMLFormElement>(null);

  useEffect(() => setHistory(loadSearchHistory()), []);

  useEffect(() => {
    const query = text.trim();
    if (query.length < 3) {
      setResults([]);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchPlaces(query, controller.signal)
        .then((places) => {
          setResults(places);
          setFailed(false);
          setActive(-1);
        })
        .catch((error) => {
          if (error?.name !== 'AbortError') setFailed(true);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const options = text.trim().length >= 3 ? results : history;

  function choose(place: Place) {
    setHistory(saveToSearchHistory(place));
    setText(place.label);
    setOpen(false);
    onSelect(place);
  }

  return (
    <form
      class="search"
      role="search"
      ref={container}
      onSubmit={(e) => {
        e.preventDefault();
        const place = options[active] ?? options[0];
        if (place) choose(place);
      }}
    >
      <input
        type="search"
        placeholder="Search an NYC address"
        aria-label="Search an NYC address"
        autocomplete="off"
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls="search-results"
        aria-activedescendant={active >= 0 ? `search-result-${active}` : undefined}
        value={text}
        onInput={(e) => {
          setText(e.currentTarget.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, options.length - 1));
          else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, -1));
          else if (e.key === 'Escape') setOpen(false);
          else return;
          e.preventDefault();
        }}
      />
      {open && (options.length > 0 || failed) ? (
        <ul class="search-results" id="search-results" role="listbox">
          {failed ? <li class="search-empty">Search isn't available right now.</li> : null}
          {!failed && options === history ? <li class="search-heading">Recent</li> : null}
          {options.map((place, i) => (
            <li
              key={place.label}
              id={`search-result-${i}`}
              role="option"
              aria-selected={i === active}
              onPointerDown={(e) => {
                e.preventDefault();
                choose(place);
              }}
            >
              {place.label}
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
