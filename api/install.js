// api/install.js
import postgres from 'postgres';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { connectionString } = req.body;

  if (!connectionString || !connectionString.includes('postgresql://')) {
    return res.status(400).json({ error: 'Invalid PostgreSQL connection string.' });
  }

  // Connect to the user's provided database
  const sql = postgres(connectionString, { ssl: 'require' });

  try {
    // Locate and read the schema file
    const schemaPath = path.resolve(process.cwd(), 'db/schema.sql');
    const schemaQuery = fs.readFileSync(schemaPath, 'utf8');

    // Execute the SQL dump
    await sql.unsafe(schemaQuery);

    // Close the connection
    await sql.end();

    res.status(200).json({ success: true, message: 'Database structures created successfully!' });
  } catch (error) {
    await sql.end();
    console.error("Installation Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}