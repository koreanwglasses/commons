import { useSocket } from "@koreanwglasses/nexs";
import { useContext, useEffect, useState } from "react";
import { SubState, SubContext } from "../components/sub-provider";

export const useSub = (
  path: string,
  query?: Record<string, any> | null,
  init?: RequestInit
): SubState => {
  const subs = useContext(SubContext);
  const [dataKey, setDataKey] = useState();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const socket = useSocket();

  useEffect(() => {
    if (socket) {
      const dataKeyPromise = (async () => {
        const dataKey = await socket.get(
          path,
          { ...(query ?? {}), _commons_subscribe: true },
          init
        );
        setDataKey(dataKey);
        return dataKey;
      })();

      return () => {
        (async () => {
          const dataKey = await dataKeyPromise;
          socket.emit(`cascade:${dataKey}:close`);
        })();
      };
    }
  }, [socket, path, query, init]);

  return (dataKey && subs[dataKey]) ?? { loading: true };
};
