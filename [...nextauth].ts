// pages/api/auth/[...nextauth].ts
import NextAuth from "next-auth";
import WorldcoinProvider from "next-auth/providers/worldcoin";

export default NextAuth({
  providers: [
    WorldcoinProvider({
      clientId: process.env.WORLD_ID_APP_ID!,
      clientSecret: process.env.WORLD_ID_API_KEY!,
      wellKnown: "https://id.worldcoin.org/.well-known/openid-configuration",
      authorization: { params: { scope: "openid" } },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async session({ session, token }) {
      session.userRole = token.userRole;
      return session;
    },
    async jwt({ token }) {
      token.userRole = "admin";
      return token;
    },
  },
  debug: true,
});

