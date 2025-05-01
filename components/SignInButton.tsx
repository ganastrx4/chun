'use client'

import { IDKitWidget, VerificationLevel } from '@worldcoin/idkit'
import { useState } from 'react'

export default function SignInButton() {
  const [status, setStatus] = useState("Esperando verificación...");

  const handleProof = async (result: any) => {
    setStatus("Enviando prueba al backend...");

    try {
      const res = await fetch('/api/world-id-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });

      const data = await res.json();

      if (data.success) {
        setStatus("✅ Verificado con éxito y reenviado a Flask");
        console.log("Respuesta desde Flask:", data.flaskResponse);
      } else {
        setStatus("❌ Falló la verificación.");
      }
    } catch (err) {
      console.error(err);
      setStatus("❌ Error de conexión con el backend.");
    }
  };

  return (
    <div>
      <IDKitWidget
        app_id="app_7686f9027d3e3c0b53d987a3caf1e111"
        action="user_login"
        signal="user_login"
        onSuccess={handleProof}
        verification_level={VerificationLevel.Device}
      >
        {({ open }) => (
          <button
            onClick={open}
            style={{
              padding: '12px 24px',
              backgroundColor: '#0c4a6e',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              fontSize: '16px',
              cursor: 'pointer'
            }}
          >
            🌐 Verificar con World ID
          </button>
        )}
      </IDKitWidget>
      <p style={{ marginTop: '12px' }}>{status}</p>
    </div>
  )
}

