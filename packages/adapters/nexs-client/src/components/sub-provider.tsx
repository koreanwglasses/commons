import { useSocket } from "@koreanwglasses/nexs";
import React, { createContext, useEffect, useState } from "react";

export type SubState = { error?: any; data?: any; loading: boolean };
type Subs = Record<string, SubState>;

export const SubContext = createContext<Subs>({});

const SubProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [subs, setSubs] = useState<Subs>({});

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const socket = useSocket();

  useEffect(() => {
    if (socket) {
      const listener = (event: string, val_err: any) => {
        const dataKey = /^cascade:(.*):(value|error)$/.exec(event)?.[1];
        if (!dataKey) return;

        console.log(event, val_err);

        const isError = /error$/.test(event);

        setSubs((subs) => ({
          ...subs,
          [dataKey]: isError
            ? { error: val_err, loading: false }
            : { data: val_err, loading: false },
        }));
      };
      socket.onAny(listener);
      return () => {
        socket.offAny(listener);
      };
    }
  }, [socket]);

  return <SubContext.Provider value={subs}>{children}</SubContext.Provider>;
};

export default SubProvider;
