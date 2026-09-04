/**
 * @NApiVersion 2.1
 */
define(['N/query'],
    /**
 * @param{query} query
 */
    (query) => {

        const runQuery = async (queryString, params) => {
            try {
                const resultSet = await query.runSuiteQL.promise({
                    query: queryString,
                    params: params || []
                });
                const rows = resultSet.asMappedResults();
                log.debug('Query Results', JSON.stringify(rows));
                return rows;
            } catch (error) {
                log.error('Error running query', error);
                return [];
            }
        }

        function getLast24Months() {
            const months = [];
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth() - 23, 1);
            for (let i = 0; i < 24; i++) {
                const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                months.push(`${year}-${month}`);
            }
            return months;
        }

        function buildMonthlySeries(salesRows) {
            const months = getLast24Months();
            const byMonth = {};

            salesRows.forEach(row => {
                const d = new Date(row.salesmonth);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                byMonth[key] = (byMonth[key] || 0) + Number(row.qtysold);
            });

            return months.map(m => byMonth[m] || 0);
        }

        function linearRegression(yValues) {
            const n = yValues.length;
            const xValues = yValues.map((_, i) => i);

            const sumX = xValues.reduce((a, b) => a + b, 0);
            const sumY = yValues.reduce((a, b) => a + b, 0);
            const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
            const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);

            const denominator = (n * sumX2) - (sumX * sumX);
            const slope = denominator === 0 ? 0 : ((n * sumXY) - (sumX * sumY)) / denominator;
            const intercept = (sumY - (slope * sumX)) / n;

            return { slope: slope, intercept: intercept };
        }

        function forecastNextMonths(salesRows, monthsAhead) {
            const series = buildMonthlySeries(salesRows);
            const regression = linearRegression(series);

            const forecast = [];
            for (let i = 0; i < monthsAhead; i++) {
                const x = series.length + i;
                const predicted = (regression.slope * x) + regression.intercept;
                forecast.push(Math.max(predicted, 0));
            }
            return forecast;
        }

        return {
            runQuery: runQuery,
            getLast24Months: getLast24Months,
            buildMonthlySeries: buildMonthlySeries,
            linearRegression: linearRegression,
            forecastNextMonths: forecastNextMonths
        };

    });