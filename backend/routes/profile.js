const express = require('express');
const router = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM candidate_profiles WHERE id=1');
    if (!rows.length) return res.status(404).json({ error: 'Profile not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', async (req, res) => {
  const { full_name, email, phone, linkedin, github, portfolio, bio, skills, projects, experience_years } = req.body;
  try {
    const { rows } = await pool.query(`
      UPDATE candidate_profiles SET
        full_name        = COALESCE($1, full_name),
        email            = COALESCE($2, email),
        phone            = COALESCE($3, phone),
        linkedin         = COALESCE($4, linkedin),
        github           = COALESCE($5, github),
        portfolio        = COALESCE($6, portfolio),
        bio              = COALESCE($7, bio),
        skills           = COALESCE($8::jsonb, skills),
        projects         = COALESCE($9::jsonb, projects),
        experience_years = COALESCE($10, experience_years),
        updated_at       = NOW()
      WHERE id = 1
      RETURNING *
    `, [
      full_name || null,
      email || null,
      phone || null,
      linkedin || null,
      github || null,
      portfolio || null,
      bio || null,
      skills ? JSON.stringify(skills) : null,
      projects ? JSON.stringify(projects) : null,
      experience_years ?? null,
    ]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
