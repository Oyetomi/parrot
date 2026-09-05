/** @type {import('next').NextConfig} */
const nextConfig = {
  // There is a stray lockfile higher up this machine's home directory, and
  // Next would otherwise infer that as the workspace root.
  outputFileTracingRoot: import.meta.dirname,
  // Parrot has no backend: the whole app is static files, the API key lives in
  // the browser, and requests go straight to Groq. A static export keeps that
  // true and deploys anywhere.
  //
  // Want a hosted mode where visitors do not bring their own key? Delete this
  // line and add an app/api route that holds the key server-side. Nothing else
  // in the project has to change — lib/ never touches the network directly.
  output: 'export',
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default nextConfig;
