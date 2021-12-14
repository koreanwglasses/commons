import { ReportProblem } from "@mui/icons-material";
import { CircularProgress, Collapse, Tooltip } from "@mui/material";
import deepEqual from "deep-is";
import React, {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Flex, RFlex } from "./flex";
import { useCommons } from "@koreanwglasses/commons-beta/react"

export const FlexFormContext = createContext<{
  submit?(): Promise<void>;
  disabled?: boolean;
}>({});

export const FlexForm = ({
  children,
  action,
  onSubmit = () => {
    /* no-op */
  },
  onSubmitted = () => {
    /* no-op */
  },
  submitUnchanged = false,
  hideError = false,
}: React.PropsWithChildren<{
  action?: string | ((body: any) => Promise<unknown>);
  onSubmit?: (changed?: boolean) => void;
  onSubmitted?: (error: any, response?: any) => void;
  submitUnchanged?: boolean;
  hideError?: boolean;
}>) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastError, setLastError] = useState<Error | null>(null);
  const commons = useCommons();

  const form = useRef<HTMLFormElement>(null);
  const getData = useCallback(
    () =>
      Object.fromEntries(
        new FormData(form.current as HTMLFormElement).entries()
      ),
    []
  );

  const lastData = useRef<any>();
  useEffect(() => {
    lastData.current = getData();
  }, [getData]);

  const _lock = useRef(false);
  const submit = async () => {
    if (!action) return;

    const data = getData();
    if (!submitUnchanged && deepEqual(lastData.current, data))
      return onSubmit(false);

    if (_lock.current) return;
    _lock.current = true;

    onSubmit(true);
    setIsSubmitting(true);

    form
      .current!.querySelectorAll(":focus")
      .forEach((elem) => (elem as Partial<HTMLInputElement>).blur?.());

    try {
      if (typeof action === "string") {
        if (action.startsWith("DEBUG")) {
          console.log("DEBUG", data);
          if (action.startsWith("DEBUG-DELAY"))
            await new Promise((res) => setTimeout(res, 1000));

          if (action.startsWith("DEBUG-ERROR"))
            await new Promise((_, rej) => setTimeout(rej, 1000));
        } else {
          onSubmitted(null, await commons.action(action, data));
        }
        lastData.current = data;
      } else {
        onSubmitted(null, await action(data));
      }
    } catch (e) {
      onSubmitted(e);
      setLastError(e as Error);
    } finally {
      setIsSubmitting(false);
      _lock.current = false;
    }
  };

  return (
    <Flex
      component="form"
      position="relative"
      ref={form}
      onSubmit={async (e) => {
        e.preventDefault();
        submit();
      }}
    >
      <RFlex>
        <Collapse orientation="horizontal" in={!!lastError}>
          <Tooltip
            title={lastError?.message.split("\n")[0] ?? ""}
            componentsProps={{
              tooltip: { sx: { bgcolor: "rgba(200, 0, 0)" } },
            }}
          >
            <ReportProblem
              fontSize="inherit"
              sx={{
                mr: 0.5,
                transform: "translateY(25%)",
                color: (theme) => theme.palette.error.main,
              }}
            />
          </Tooltip>
        </Collapse>
        <Flex
          sx={{
            opacity: isSubmitting ? 0.5 : 1,
            pointerEvents: isSubmitting ? "none" : "auto",
            transition: "opacity 0.3s",
          }}
        >
          <FlexFormContext.Provider
            value={{
              submit,
              disabled: !action,
            }}
          >
            {children}
          </FlexFormContext.Provider>
        </Flex>
      </RFlex>
      <Flex
        position="absolute"
        width={1}
        height={1}
        sx={{
          opacity: isSubmitting ? 1 : 0,
          transition: "opacity 0.3s",
          display: isSubmitting ? undefined : "hidden",
          pointerEvents: "none",
        }}
      >
        <CircularProgress />
      </Flex>
    </Flex>
  );
};
