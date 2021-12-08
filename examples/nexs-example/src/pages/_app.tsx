import type { AppProps } from "next/app";
import React from "react";
import { SocketProvider } from "@koreanwglasses/nexs";
import { SubProvider } from "@koreanwglasses/commons-nexs-client";

function App({ Component, pageProps }: AppProps) {
  // We only want one socket per client instance, so we
  // provide it at the root component level.
  return (
    <SocketProvider>
      <SubProvider>
        <Component {...pageProps} />;
      </SubProvider>
    </SocketProvider>
  );
}

export default App;
