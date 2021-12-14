import { CommonsContext } from "./component";
import { useContext, useEffect, useMemo, useState } from "react";
import { Unpacked } from "../client";

export function useCommons() {
  return useContext(CommonsContext)!;
}

export function useQuery<T>(path: string, ...params: any) {
  const commons = useContext(CommonsContext)!;

  const [state, setState] = useState<{
    result?: Unpacked<T>;
    error?: any;
    loading: boolean;
  }>({ loading: true });

  const _params = useMemo(() => params, []);

  useEffect(() => {
    const cascade = commons.query(path, ..._params);
    cascade
      .p((packed) => {
        setState({ result: commons.unpack(packed), loading: false });
      })
      .catch((error) => {
        setState({ error, loading: false });
      });
    return () => {
      cascade.close();
    };
  }, [commons, _params, path]);

  return state;
}
