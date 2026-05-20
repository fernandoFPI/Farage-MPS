import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import pool from '../config/db.js';

function requireAdmin(req, res, next) {
  if (req.user?.role?.name !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

const router = Router();

router.post('/recalculate-excess', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { rows: countRows } = await pool.query('SELECT COUNT(*) AS total FROM meter_readings');
    const totalReadings = Number(countRows[0].total);

    const { rows: updatedRows } = await pool.query(`
      WITH new_values AS (
        SELECT
          mr.id,
          CASE c.contract_mode
            WHEN 'osg' THEN mr.a4_bw + mr.a3_bw
            WHEN 'psg' THEN mr.a4_bw
            WHEN 'psg_simple' THEN mr.a4_bw
            ELSE mr.excess_bw
          END AS new_excess_bw,
          CASE c.contract_mode
            WHEN 'osg' THEN mr.a4_color + mr.a3_color
            WHEN 'psg' THEN mr.a4_color - mr.xls
            WHEN 'psg_simple' THEN mr.a4_color
            ELSE mr.excess_color
          END AS new_excess_color
        FROM meter_readings mr
        JOIN billing_cycles bc ON mr.billing_cycle_id = bc.id
        JOIN contracts c ON bc.contract_id = c.id
      ),
      updated AS (
        UPDATE meter_readings mr
        SET
          excess_bw    = nv.new_excess_bw,
          excess_color = nv.new_excess_color
        FROM new_values nv
        WHERE mr.id = nv.id
          AND (mr.excess_bw IS DISTINCT FROM nv.new_excess_bw
            OR mr.excess_color IS DISTINCT FROM nv.new_excess_color)
        RETURNING mr.id
      )
      SELECT COUNT(*) AS updated_count FROM updated
    `);

    const updatedReadings = Number(updatedRows[0].updated_count);
    const skippedReadings = totalReadings - updatedReadings;

    console.log(`[admin] recalculate-excess: ${updatedReadings}/${totalReadings} readings updated`);

    res.json({
      message: 'Excess recalculation complete',
      totalReadings,
      updatedReadings,
      skippedReadings,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
