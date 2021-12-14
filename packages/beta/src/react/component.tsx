import React, { createContext, useMemo } from "react";
import commons, { CommonsClient } from "../client";

export const CommonsContext = createContext<CommonsClient | null>(null);

const CommonsProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const client = useMemo(() => commons(), []);
  return (
    <CommonsContext.Provider value={client}>{children}</CommonsContext.Provider>
  );
};

export default CommonsProvider;
