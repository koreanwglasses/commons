import { IconButton, IconButtonProps, keyframes } from "@mui/material";
import { Cached } from "@mui/icons-material";
import React, { useState } from "react";

const rotate = keyframes`
  from {
    transform: rotate(0deg)
  }
  to {
    transform: rotate(-360deg)
  }
`;

// eslint-disable-next-line react/display-name
export const Refresh = React.forwardRef(
  (
    {
      action,
      ...props
    }: { action?: () => Promise<void> | void } & IconButtonProps,
    ref
  ) => {
    const [waiting, setWaiting] = useState(false);
    return (
      <IconButton
        disabled={waiting || !action}
        onClick={async () => {
          setWaiting(true);
          await action?.();
          setWaiting(false);
        }}
        {...props}
        ref={ref as any}
      >
        <Cached
          fontSize="inherit"
          sx={{
            animation: waiting ? `${rotate} 1s linear 0s infinite` : undefined,
          }}
        />
      </IconButton>
    );
  }
);
