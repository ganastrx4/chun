import NextAuth, { NextAuthOptions } from "next-auth";

// Configuración de NextAuth
export const authOptions: NextAuthOptions = {
  providers: [
    {
      id: "worldcoin",
      name: "Worldcoin",
      type: "oauth",
      wellKnown: "https://id.worldcoin.org/.well-known/openid-configuration",
      authorization: { params: { scope: "openid" } },
      clientId: process.env.WORLD_ID_APP_ID,       // <<<<< Verifica que el ID esté correcto
      clientSecret: process.env.WORLD_ID_API_KEY,   // <<<<< Verifica que la clave esté correcta
      idToken: true,
      checks: ["state", "nonce", "pkce"],
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.sub,
          verificationLevel: profile["https://id.worldcoin.org/v1"].verification_level,
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token }) {
      token.userRole = "admin"; // Puedes ajustar el rol si lo deseas
      return token;
    },
  },
  debug: true,
};

export default NextAuth(authOptions);

