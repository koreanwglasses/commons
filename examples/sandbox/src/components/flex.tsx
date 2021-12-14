import { Box, BoxProps } from "@mui/material";
import { styled } from "@mui/material/styles";

export const Flex = styled(Box)<BoxProps>({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
});

export const RFlex = styled(Box)<BoxProps>({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "row",
});
