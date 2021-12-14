import React from "react";
import { Flex } from "./flex";

export const Layout = ({ children }: React.PropsWithChildren<{}>) => (
  <Flex sx={{ width: "100vw", height: "100vh", overflow: "clip" }}>
    {children}
  </Flex>
);
