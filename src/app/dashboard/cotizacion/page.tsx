'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';

interface FormData {
  prospectName: string;
  projectName: string;
  age: number;
  insuredAmount: number; // Suma Asegurada
  basicPremium: number; // Prima Básica
  paymentTerm: number; // Plazo de Pagos (5, 10, 15, 20)
  currency: 'UDIS' | 'Dolares'; // Moneda
  effectiveValueYear14: number;
  effectiveValueYear19: number;
  effectiveValueYear24: number;
  currentUDIValue: number; // Valor Actual UDI o Dólar
  projectedDevaluation: number; // Devaluación Proyectada (%)
  advisor: string;
}

interface ProjectionRow {
  year: number;
  age: number;
  annualContributionUDIS: number;
  annualContributionPesos: number;
  udiValue: number;
  lifeProtectionUDIS: number;
  lifeProtectionPesos: number;
}

interface SummaryBox {
  year: number;
  effectiveValueUDIS: number;
  udiValue: number;
  effectiveValuePesos: number;
  profit: number;
  profitPercentage: number;
}

function CotizacionPageContent() {
  const { profile } = useAuth();

  const [formData, setFormData] = useState<FormData>({
    prospectName: '',
    projectName: '',
    age: 23,
    insuredAmount: 145000,
    basicPremium: 4021,
    paymentTerm: 15,
    currency: 'UDIS',
    effectiveValueYear14: 54107,
    effectiveValueYear19: 57100,
    effectiveValueYear24: 60127,
    currentUDIValue: 8.56,
    projectedDevaluation: 4.0, // Default for UDIS
    advisor: profile?.name || '',
  });

  const [showProjection, setShowProjection] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    // If currency changes, set default inflation/devaluation values
    if (name === 'currency') {
      const newCurrency = value as 'UDIS' | 'Dolares';
      setFormData(prev => ({
        ...prev,
        currency: newCurrency,
        projectedDevaluation: newCurrency === 'UDIS' ? 4.0 : 3.0,
      }));
      return;
    }

    setFormData(prev => ({
      ...prev,
      [name]: name === 'age' || name === 'insuredAmount' || name === 'basicPremium' ||
        name === 'paymentTerm' || name === 'effectiveValueYear14' || name === 'effectiveValueYear19' ||
        name === 'effectiveValueYear24' || name === 'currentUDIValue' ||
        name === 'projectedDevaluation'
        ? parseFloat(value) || 0
        : value
    }));
  };

  // Calculate projection table
  const projectionData = useMemo((): ProjectionRow[] => {
    if (!showProjection) return [];

    const rows: ProjectionRow[] = [];
    const totalYears = 28;
    const contributionYears = formData.paymentTerm; // Years with contributions based on selected term

    for (let year = 1; year <= totalYears; year++) {
      // Calculate exchange rate value for this year (compounded devaluation)
      // This represents UDI value in Pesos or Dollar exchange rate in Pesos
      const exchangeRate = formData.currentUDIValue * Math.pow(1 + formData.projectedDevaluation / 100, year - 1);

      // Annual contribution (only for first N years based on payment term)
      const annualContributionBase = year <= contributionYears ? formData.basicPremium : 0;
      const annualContributionPesos = annualContributionBase * exchangeRate;

      // Life protection (constant in base currency, converted to Pesos)
      const lifeProtectionBase = formData.insuredAmount;
      const lifeProtectionPesos = lifeProtectionBase * exchangeRate;

      rows.push({
        year,
        age: formData.age + year - 1,
        annualContributionUDIS: annualContributionBase, // Keep name for compatibility, but represents base currency
        annualContributionPesos,
        udiValue: exchangeRate, // Represents exchange rate (UDI or Dollar)
        lifeProtectionUDIS: lifeProtectionBase, // Keep name for compatibility, but represents base currency
        lifeProtectionPesos,
      });
    }

    return rows;
  }, [formData, showProjection]);

  // Calculate summary boxes
  const summaryBoxes = useMemo((): SummaryBox[] => {
    if (!showProjection || projectionData.length === 0) return [];

    // Calculate total contribution in Pesos
    const totalContributionPesos = projectionData
      .filter(row => row.annualContributionPesos > 0)
      .reduce((sum, row) => sum + row.annualContributionPesos, 0);

    const summaries: SummaryBox[] = [];

    // Year 14 summary
    const year14Row = projectionData.find(row => row.year === 14);
    if (year14Row) {
      const effectiveValuePesos = formData.effectiveValueYear14 * year14Row.udiValue;
      const profit = effectiveValuePesos - totalContributionPesos;
      const profitPercentage = (profit / totalContributionPesos) * 100;

      summaries.push({
        year: 14,
        effectiveValueUDIS: formData.effectiveValueYear14,
        udiValue: year14Row.udiValue,
        effectiveValuePesos,
        profit,
        profitPercentage,
      });
    }

    // Year 19 summary
    const year19Row = projectionData.find(row => row.year === 19);
    if (year19Row) {
      const effectiveValuePesos = formData.effectiveValueYear19 * year19Row.udiValue;
      const profit = effectiveValuePesos - totalContributionPesos;
      const profitPercentage = (profit / totalContributionPesos) * 100;

      summaries.push({
        year: 19,
        effectiveValueUDIS: formData.effectiveValueYear19,
        udiValue: year19Row.udiValue,
        effectiveValuePesos,
        profit,
        profitPercentage,
      });
    }

    // Year 24 summary
    const year24Row = projectionData.find(row => row.year === 24);
    if (year24Row) {
      const effectiveValuePesos = formData.effectiveValueYear24 * year24Row.udiValue;
      const profit = effectiveValuePesos - totalContributionPesos;
      const profitPercentage = (profit / totalContributionPesos) * 100;

      summaries.push({
        year: 24,
        effectiveValueUDIS: formData.effectiveValueYear24,
        udiValue: year24Row.udiValue,
        effectiveValuePesos,
        profit,
        profitPercentage,
      });
    }

    return summaries;
  }, [formData, projectionData, showProjection]);

  // Calculate total contribution for summary
  const totalContribution = useMemo(() => {
    if (!showProjection || projectionData.length === 0) return { udis: 0, pesos: 0 };

    const udis = projectionData
      .filter(row => row.annualContributionUDIS > 0)
      .reduce((sum, row) => sum + row.annualContributionUDIS, 0);

    const pesos = projectionData
      .filter(row => row.annualContributionPesos > 0)
      .reduce((sum, row) => sum + row.annualContributionPesos, 0);

    return { udis, pesos };
  }, [projectionData, showProjection]);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    setShowProjection(true);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Cotización
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Genera proyecciones financieras
          </p>
        </div>
      </div>

      {/* Input Form */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
          Datos de Entrada
        </h2>

        <form onSubmit={handleGenerate} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Nombre del Prospecto
              </label>
              <input
                type="text"
                name="prospectName"
                value={formData.prospectName}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ej: XIME"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Nombre del Proyecto
              </label>
              <input
                type="text"
                name="projectName"
                value={formData.projectName}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ej: ORVI 99 10-15"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Edad
              </label>
              <input
                type="number"
                name="age"
                value={formData.age}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="1"
                step="any"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Suma Asegurada
              </label>
              <input
                type="number"
                name="insuredAmount"
                value={formData.insuredAmount}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="0"
                step="any"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Prima Básica
              </label>
              <input
                type="number"
                name="basicPremium"
                value={formData.basicPremium}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="0"
                step="any"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Plazo de Pagos
              </label>
              <select
                name="paymentTerm"
                value={formData.paymentTerm}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={20}>20</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Moneda
              </label>
              <select
                name="currency"
                value={formData.currency}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="UDIS">UDIS</option>
                <option value="Dolares">Dolares</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {formData.currency === 'UDIS' ? 'Valor Actual UDI' : 'Valor Actual Dólar'}
              </label>
              <input
                type="number"
                name="currentUDIValue"
                value={formData.currentUDIValue}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="0"
                step="any"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {formData.currency === 'UDIS' ? 'Inflación Proyectada (%)' : 'Devaluación Proyectada (%)'}
              </label>
              <input
                type="number"
                name="projectedDevaluation"
                value={formData.projectedDevaluation}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="0"
                max="100"
                step="any"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Asesor
              </label>
              <input
                type="text"
                name="advisor"
                value={formData.advisor}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Nombre del asesor"
              />
            </div>
          </div>

          {/* Plazo de Pagos Section */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Plazo de Pagos
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Valor Efectivo Año 14
                  </label>
                  <span className="px-2 py-1 bg-blue-600 text-white text-xs font-semibold rounded">
                    14
                  </span>
                </div>
                <input
                  type="number"
                  name="effectiveValueYear14"
                  value={formData.effectiveValueYear14}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="0"
                  step="any"
                />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Valor Efectivo Año 19
                  </label>
                  <span className="px-2 py-1 bg-blue-600 text-white text-xs font-semibold rounded">
                    19
                  </span>
                </div>
                <input
                  type="number"
                  name="effectiveValueYear19"
                  value={formData.effectiveValueYear19}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="0"
                  step="any"
                />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Valor Efectivo Año 24
                  </label>
                  <span className="px-2 py-1 bg-blue-600 text-white text-xs font-semibold rounded">
                    24
                  </span>
                </div>
                <input
                  type="number"
                  name="effectiveValueYear24"
                  value={formData.effectiveValueYear24}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="0"
                  step="any"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Generar Proyección
            </button>
          </div>
        </form>
      </div>

      {/* Projection Table */}
      {showProjection && projectionData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            {formData.prospectName} {formData.projectName}
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Main Projection Table */}
            <div className="lg:col-span-2 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Año</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Edad</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Año</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase" colSpan={2}>
                      Aportación Anual
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                      {formData.currency === 'UDIS' ? 'Valor UDI*' : 'Tipo Cambio*'}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase" colSpan={2}>
                      Protección Vitalicia
                    </th>
                  </tr>
                  <tr>
                    <th></th>
                    <th></th>
                    <th></th>
                    <th className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-300">{formData.currency}</th>
                    <th className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-300">Pesos</th>
                    <th></th>
                    <th className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-300">{formData.currency}</th>
                    <th className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-300">Pesos</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {projectionData.map((row) => (
                    <tr key={row.year} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-3 py-2 whitespace-nowrap text-gray-900 dark:text-white">{row.year}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-900 dark:text-white">{row.age}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-900 dark:text-white">{row.year}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-900 dark:text-white">
                        {row.annualContributionUDIS > 0 ? row.annualContributionUDIS.toLocaleString('es-MX') : ''}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-900 dark:text-white">
                        {row.annualContributionPesos > 0 ? row.annualContributionPesos.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : ''}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-900 dark:text-white">
                        {row.udiValue.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-900 dark:text-white">
                        {row.lifeProtectionUDIS.toLocaleString('es-MX')}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-900 dark:text-white">
                        {row.lifeProtectionPesos.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                * {formData.currency === 'UDIS' ? 'Inflación' : 'Devaluación'} proyectada: {formData.projectedDevaluation}%
              </p>
            </div>

            {/* Summary Boxes */}
            <div className="space-y-4">
              {/* Total Contribution */}
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  Aportación Total
                </h3>
                <div className="space-y-2">
                  <div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">{formData.currency}: </span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {totalContribution.udis.toLocaleString('es-MX')}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">Pesos: </span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {totalContribution.pesos.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Summary Boxes for Years 14, 19, 24 */}
              {summaryBoxes.map((summary) => (
                <div key={summary.year} className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Valor Efectivo Año {summary.year}
                  </h3>
                  <div className="space-y-2">
                    <div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">{formData.currency}: </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {summary.effectiveValueUDIS.toLocaleString('es-MX')}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {formData.currency === 'UDIS' ? 'Valor UDI' : 'Tipo Cambio'}:
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {summary.udiValue.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">Pesos: </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {summary.effectiveValuePesos.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-gray-300 dark:border-gray-600">
                      <div className="text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Utilidad: </span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {summary.profit.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ({summary.profitPercentage.toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CotizacionPage() {
  return (
    <ProtectedRoute allowedRoles={['promotory', 'consultant']}>
      <CotizacionPageContent />
    </ProtectedRoute>
  );
}
