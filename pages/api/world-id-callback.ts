import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body;

  // Aquí puedes verificar el proof con Worldcoin si quieres (opcional)

  console.log('✅ Proof recibido:', body);

  // Luego lo mandas a tu backend Flask (ajusta la URL de ngrok si cambió)
  const flaskRes = await fetch('https://chun-drab.vercel.app/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await flaskRes.json();

  return res.status(200).json({
    success: true,
    flaskResponse: data,
  });
}

