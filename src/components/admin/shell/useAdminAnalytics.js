import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as XLSX from 'xlsx';
import { db } from '../../../db';
import { useDialog } from '../../../hooks/useDialog';
import { useTranslation } from '../../../hooks/useTranslation';
import { fromCents } from '../../../utils/moneyUtils';
import { computeCogsAndWastage } from '../../../utils/cogsMath';
import { inPeriod, netRevenue, refundTotal, operatingExpenses, salesByTender, topItems } from './analyticsMath';

// Sales, expenses and payouts from Dexie, filtered to the selected period.
export function useAdminAnalytics({ inventoryLogs, inventoryItems }) {
  const { showAlert } = useDialog();
  const { t } = useTranslation();
  const [timeFilter, setTimeFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const dexieSales = useLiveQuery(() => db.sales.toArray(), []);
  const expensesLive = useLiveQuery(() => db.expenses.toArray(), []);
  const vendorPayoutsLive = useLiveQuery(() => db.vendor_payouts.orderBy('created_at').reverse().toArray(), []);
  const tipPayoutsLive = useLiveQuery(() => db.tip_payouts.toArray(), []);
  const allSales = useMemo(() => dexieSales || [], [dexieSales]);
  const vendorPayouts = useMemo(() => vendorPayoutsLive || [], [vendorPayoutsLive]);
  const tipPayouts = useMemo(() => tipPayoutsLive || [], [tipPayoutsLive]);

  const filteredSales = useMemo(
    () => allSales.filter((s) => inPeriod(s.created_at, timeFilter, dateRange)),
    [allSales, timeFilter, dateRange],
  );
  const filteredExpenses = useMemo(() => (expensesLive || []).filter((e) => {
    if (timeFilter === 'all') return true;
    const date = e.created_at || e.timestamp;
    return !!date && inPeriod(date, timeFilter, dateRange);
  }), [expensesLive, timeFilter, dateRange]);

  const totalRevenue = useMemo(() => netRevenue(filteredSales), [filteredSales]);
  const totalRefunds = useMemo(() => refundTotal(filteredSales), [filteredSales]);
  const totalExpenses = useMemo(() => operatingExpenses(filteredExpenses), [filteredExpenses]);
  const salesByMethod = useMemo(() => salesByTender(filteredSales), [filteredSales]);
  const topItemsArray = useMemo(() => topItems(filteredSales), [filteredSales]);
  const methodCounts = useMemo(() => filteredSales.reduce((acc, s) => {
    acc[s.payment_method] = (acc[s.payment_method] || 0) + 1;
    return acc;
  }, {}), [filteredSales]);

  // Excel workbook: Resumen, Ingresos, Egresos, Auditorías.
  const handleDownloadCSV = () => {
    if (filteredSales.length === 0 && filteredExpenses.length === 0 && inventoryLogs.length === 0) {
      return showAlert(t('common.error'), t('analytics.noDataExport'));
    }
    const when = (date) => {
      const d = new Date(date);
      return { Fecha: d.toLocaleDateString(), Hora: d.toLocaleTimeString() };
    };

    const ingresos = [];
    filteredSales.forEach((sale) => {
      const base = { ...when(sale.created_at) };
      const method = sale.payment_method || 'N/A';
      const items = sale.items_sold ? sale.items_sold.join(' | ') : 'Varios';
      const row = (tipo, monto, detalles = items) => ingresos.push({ ...base, 'Tipo de Movimiento': tipo, Monto: monto, Método: method, Detalles: detalles });
      if (sale.status === 'refunded') {
        row('Reembolso Total', -fromCents(sale.total_amount || 0));
      } else {
        row('Venta', fromCents(sale.total_amount || 0));
        if (sale.status === 'partial_refund') row('Reembolso Parcial', -fromCents(sale.refund_amount || 0), 'Ajuste de ticket');
      }
    });

    const egresos = filteredExpenses.map((exp) => ({
      ...when(exp.created_at || exp.timestamp),
      'Tipo de Movimiento': exp.category ? `Gasto (${exp.category})` : 'Gasto (General)',
      Monto: -fromCents(exp.amount || 0),
      Método: 'Caja/Efectivo',
      Detalles: exp.reason || 'Sin detalles',
    }));

    const auditorias = inventoryLogs
      .filter((log) => inPeriod(log.created_at, timeFilter, dateRange))
      .map((log) => ({
        ...when(log.created_at),
        'Tipo de Movimiento': 'Auditoría / Merma',
        Monto: 0.00,
        Método: 'N/A',
        Detalles: `${log.item_name} | Ajuste: ${log.qty_deducted} | Razón: ${log.deduction_type}`,
      }));

    // Same engine as AnalyticsTab, so the export matches the screen.
    const { totalCOGS, totalWastage } = computeCogsAndWastage({ filteredSales, inventoryLogs, inventoryItems, timeFilter, dateRange });
    const resumen = [
      { Métrica: 'Ingresos Brutos', Valor: fromCents(totalRevenue + totalRefunds) },
      { Métrica: 'Reembolsos', Valor: -fromCents(totalRefunds) },
      { Métrica: 'Ingresos Netos', Valor: fromCents(totalRevenue) },
      { Métrica: 'Costo de Bienes (COGS)', Valor: -fromCents(totalCOGS) },
      { Métrica: 'Mermas y Auditorías', Valor: -fromCents(totalWastage) },
      { Métrica: 'Gastos de Operación', Valor: -fromCents(totalExpenses) },
      { Métrica: 'Ganancia Neta Verdadera', Valor: fromCents(totalRevenue) - fromCents(totalCOGS) - fromCents(totalWastage) - fromCents(totalExpenses) },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ingresos), 'Ingresos');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(egresos), 'Egresos');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(auditorias), 'Auditorías');
    XLSX.writeFile(wb, `tinypos_reporte_maestro_${timeFilter}.xlsx`);
  };

  return {
    timeFilter, setTimeFilter, dateRange, setDateRange,
    allSales, filteredSales, filteredExpenses, vendorPayouts, tipPayouts,
    totalRevenue, totalRefunds, totalExpenses, methodCounts, salesByMethod, topItemsArray,
    handleDownloadCSV,
  };
}
