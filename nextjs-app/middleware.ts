import { proxy } from "./src/proxy";

export const config = {
  matcher: ["/", "/auth", "/dashboard/:path*", "/api/:path*"],
};

export default proxy;
