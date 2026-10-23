// A date-picker range ('YYYY-MM-DD' strings) as local start/end instants.
// new Date('YYYY-MM-DD') would be UTC midnight, a day early west of UTC.
export const localDayRange = ({ start, end }) => [new Date(`${start}T00:00:00`), new Date(`${end}T23:59:59.999`)];
