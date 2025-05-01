import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/router";

export default function IndexPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const goToCripto = () => {
    router.push("/cripto");
  };

  const goToDados = () => {
    router.push("/dados");
  };

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      {session ? (
        <div>
          <button onClick={goToCripto} style={{ margin: "10px", padding: "10px 20px" }}>
            Buscador
          </button>
          <button onClick={goToDados} style={{ margin: "10px", padding: "10px 20px" }}>
            Dados
          </button>
          <button onClick={() => signOut()} style={{ margin: "10px", padding: "10px 20px" }}>
            Cerrar sesión
          </button>
        </div>
      ) : (
        <div>
          <button onClick={() => signIn()} style={{ padding: "10px 20px" }}>
            Autenticar
          </button>
        </div>
      )}
    </div>
  );
}
