import type { AppProps } from "next/app";
import React from "react";
import CommonsProvider from "@koreanwglasses/commons-beta/react";
import { createTheme, ThemeProvider } from "@mui/material";
import CssBaseline from "@mui/material/CssBaseline";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#0097a7",
    },
    secondary: {
      main: "#e91e63",
    },
  },
});


function App({ Component, pageProps }: AppProps) {
  // We only want one socket per client instance, so we
  // provide it at the root component level.

  return (
    <CommonsProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Component {...pageProps} />
      </ThemeProvider>
    </CommonsProvider>
  );
}

export default App;
