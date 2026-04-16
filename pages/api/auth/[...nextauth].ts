import NextAuth, { NextAuthOptions } from "next-auth";

// Configuración de NextAuth para Worldcoin
export const authOptions: NextAuthOptions = {
  providers: [
    {
      id: "worldcoin",
      name: "Worldcoin",
      type: "oauth",
      wellKnown: "https://id.worldcoin.org/.well-known/openid-configuration",
      authorization: { params: { scope: "openid" } },
      // Usamos las variables exactas que configuramos en tu .env.local
      clientId: process.env.WLD_APP_ID, 
      clientSecret: process.env.WLD_CLIENT_SECRET, 
      idToken: true,
      checks: ["state", "nonce", "pkce"],
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.sub,
          // Extraemos el nivel de verificación (Orb o Device)
          verificationLevel: profile["https://id.worldcoin.org/v1"].verification_level,
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, profile }) {
      token.userRole = "admin"; 
      // Si el perfil existe (primer inicio de sesión), guardamos el nivel de World ID
      if (profile) {
        token.verificationLevel = (profile as any)["https://id.worldcoin.org/v1"]?.verification_level;
      }
      return token;
    },
    async session({ session, token }) {
      // Pasamos los datos del token a la sesión para que los veas en el frontend
      if (session.user) {
        (session.user as any).role = token.userRole;
        (session.user as any).verificationLevel = token.verificationLevel;
      }
      return session;
    },
  },
  // Activa el modo debug para ver errores en la consola de VS Code / Terminal
  debug: process.env.NODE_ENV === "development",
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
