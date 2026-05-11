// src/utils/numeroALetras.js

export const numeroALetras = (numero) => {
  const unidades = ['CERO', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const decenas = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const decenasPuras = ['VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  const leerDecenas = (num) => {
    if (num < 10) return unidades[num];
    if (num < 20) return decenas[num - 10];
    if (num === 20) return 'VEINTE';
    if (num < 30) return 'VEINTI' + unidades[num - 20];
    const dec = Math.floor(num / 10);
    const uni = num % 10;
    return decenasPuras[dec - 2] + (uni > 0 ? ' Y ' + unidades[uni] : '');
  };

  const leerCentenas = (num) => {
    if (num === 100) return 'CIEN';
    const cen = Math.floor(num / 100);
    const rest = num % 100;
    return centenas[cen] + (rest > 0 ? ' ' + leerDecenas(rest) : '');
  };

  const leerMiles = (num) => {
    const miles = Math.floor(num / 1000);
    const rest = num % 1000;
    let strMiles = '';
    if (miles === 1) strMiles = 'UN MIL';
    else if (miles > 1) strMiles = leerCentenas(miles) + ' MIL';
    return strMiles + (rest > 0 ? ' ' + leerCentenas(rest) : '');
  };

  const decimalNum = numero / 100;
  const entero = Math.floor(decimalNum);
  const centavos = (numero % 100).toString().padStart(2, '0');
  
  let letras = entero < 1000 ? leerCentenas(entero) : leerMiles(entero);
  if (entero === 0) letras = 'CERO';
  
  const moneda = entero === 1 ? 'PESO' : 'PESOS';
  
  return `${letras} ${moneda} ${centavos}/100 M.N.`;
};