const db = require('./db/database');
(async () => {
  const stats = await db.getEquipmentStatsSummary();
  console.log(JSON.stringify(stats, null, 2));
})();
