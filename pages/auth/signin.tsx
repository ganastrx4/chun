import { getProviders, signIn, useSession } from "next-auth/react";
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function SignIn({ providers }: any) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.push("https://ganastrx4.github.io/chc-flask-app/buscador.html");
    }
  }, [status, router]);

  if (status === "loading") {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <img
        src="https://worldcoin.org/_next/image?url=%2Fimages%2Fecosystem%2Fapp_7686f9027d3e3c0b53d987a3caf1e111.png&w=640&q=75"
        alt="World ID App Logo"
        style={{ width: '200px', marginBottom: '20px' }}
      />
      <h1>Inicia sesión con World ID</h1>
      {providers && Object.values(providers).map((provider: any) => (
        <div key={provider.name}>
          <button
            onClick={() =>
              signIn(provider.id, {
                callbackUrl: "https://ganastrx4.github.io/chc-flask-app/buscador.html",
              })
            }
            style={{ padding: '10px 20px', margin: '10px', fontSize: '16px' }}
          >
            Entrar con {provider.name}
          </button>
        </div>
      ))}
    </div>
  );
}

// Obtener los providers en el servidor
export async function getServerSideProps() {
  const providers = await getProviders();
  return {
    props: { providers },
  };
}

