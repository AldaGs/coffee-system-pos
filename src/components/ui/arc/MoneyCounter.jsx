import { AnimatedCounter } from './animated-counter';
import { fromCents } from '../../../utils/moneyUtils';

/** A cents amount whose digits roll like an odometer when it changes. Takes its font and color from the surrounding text. */
export function MoneyCounter({ cents, lang = 'es' }) {
  return (
    <span className="arc arc-money">
      <AnimatedCounter value={fromCents(cents || 0)} prefix="$" decimals={2} locale={lang === 'es' ? 'es-MX' : 'en-US'} />
    </span>
  );
}
