import { Box, Paper } from "@mui/material";
import { Card } from "../../resources/game";
import { Img } from "../styled";

export const PlayingCard = ({
  card,
  width = 80,
}: {
  card: Card | "back";
  width?: number;
}) => {
  return (
    <Paper  elevation={6} sx={{ p: width / 160, boxShadow: "0px 0px 30px 0px rgba(0,0,0,0.4)" }}>
      <Box width={width * 0.9} height={1.5 * width * 0.9} overflow="clip">
        <Img
          src={`/cards/${card}.svg`}
          width={width * 1.1 * 0.9}
          height={1.5 * width * 1.1 * 0.9}
          sx={{
            filter:
              "invert(90%) hue-rotate(180deg) contrast(90%) saturate(120%) ",
            transform: "scale(110%)",
          }}
        />
      </Box>
    </Paper>
  );
};
