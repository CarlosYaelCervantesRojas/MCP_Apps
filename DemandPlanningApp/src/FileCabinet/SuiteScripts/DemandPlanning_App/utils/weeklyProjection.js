/**
 * weeklyProjection.js
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([], function () {

    function addDays(date, days) {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        return d;
    }

    function formatDate(d) {
        return d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
    }

    function arrivalsInWeek(inboundShipments, weekNumber, today) {
        const weekStart = addDays(today, (weekNumber - 1) * 7);
        const weekEnd = addDays(today, weekNumber * 7);

        let arrivals = inboundShipments
            .filter(s => {
                const d = new Date(s.expecteddeliverydate);
                return d >= weekStart && d < weekEnd;
            })
            .reduce((sum, s) => sum + Number(s.quantityremaining), 0);

        if (weekNumber === 1) {
            const pastDue = inboundShipments
                .filter(s => new Date(s.expecteddeliverydate) < today)
                .reduce((sum, s) => sum + Number(s.quantityremaining), 0);
            arrivals += pastDue;
        }

        return arrivals;
    }

    function projectInventory(onHandToday, weeklyDemand, inboundShipments, numberOfWeeks, today) {
        let balance = onHandToday;
        const projection = [];

        for (let week = 1; week <= numberOfWeeks; week++) {
            const weekStart = addDays(today, (week - 1) * 7);
            const weekEnd = addDays(today, week * 7);
            const arrivals = arrivalsInWeek(inboundShipments, week, today);
            balance = balance + arrivals - weeklyDemand;

            projection.push({
                week: week,
                weekStart: formatDate(weekStart),
                weekEnd: formatDate(weekEnd),
                arrivals: arrivals,
                balance: Math.round(balance)
            });
        }
        return projection;
    }

    function calculateAmountNeeded(projection, reorderPoint, avgOLT) {
        const oltWeek = Math.max(1, Math.round(avgOLT / 7));
        const point = projection[oltWeek - 1] || projection[projection.length - 1];

        const balanceAtOLT = point.balance;
        const arrivalsAfterOLT = projection
            .slice(oltWeek)
            .reduce((sum, p) => sum + p.arrivals, 0);

        const amountNeeded = reorderPoint - (balanceAtOLT + arrivalsAfterOLT);

        return {
            oltWeek: oltWeek,
            oltDate: point.weekStart,
            balanceAtOLT: balanceAtOLT,
            arrivalsAfterOLT: arrivalsAfterOLT,
            amountNeeded: Math.round(amountNeeded),
            suggestedOrderQty: Math.max(Math.round(amountNeeded), 0)
        };
    }

    return {
        projectInventory: projectInventory,
        calculateAmountNeeded: calculateAmountNeeded
    };
});