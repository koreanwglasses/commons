import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { Layout } from "../components/layout";
import { Flex, RFlex } from "../components/flex";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Card } from "../resources/game";
import { GifBoxSharp, KeyboardArrowLeft } from "@mui/icons-material";
import { useRouter } from "next/dist/client/router";
import { CardHand } from "../components/playing-cards/cards-hand";
import { useQuery } from "@koreanwglasses/commons-beta/react";
import { Unpacked } from "@koreanwglasses/commons-beta/client";
import { ClientState } from "../resources/session";
import { PlayingCard } from "../components/playing-cards/playing-card";
import FlipMove from "react-flip-move";

const GameContext = createContext<{
  state: Unpacked<ClientState>;
} | null>(null);

const Loader = () => {
  const router = useRouter();

  const state = useQuery<ClientState>("/api/app/state");

  return (
    <Layout>
      <Button
        onClick={() => {
          state.result?.user?.actions?.leaveRoom();
          router.push("/");
        }}
        sx={{ position: "absolute", left: 2, top: 2 }}
      >
        <KeyboardArrowLeft />
        Leave
      </Button>
      {state.loading && <CircularProgress />}
      {!state.loading && state.result && (
        <GameContext.Provider
          value={{
            state: state.result,
          }}
        >
          <GameView />
        </GameContext.Provider>
      )}
    </Layout>
  );
};

export default Loader;

const GameView = () => {
  const { state } = useContext(GameContext)!;

  const [myCards, setMyCards] = useState([] as Card[]);
  useEffect(() => {
    const remoteCards = state.game?.state?.myCards ?? [];
    setMyCards((myCards) => [
      ...myCards.filter((card) => remoteCards.includes(card)),
      ...(remoteCards.filter(
        (card) => !myCards.includes(card as Card)
      ) as Card[]),
    ]);
  }, [state.game?.state?.myCards.join(",")]);

  return (
    <>
      <RFlex
        gap={1}
        position="absolute"
        sx={{ bottom: 24, left: 24, width: "calc(100% - 48px)" }}
      >
        <Flex>
          <Typography variant="h6">
            {state.user?.state?.username} (me)
          </Typography>
        </Flex>
        <CardHand
          cards={myCards}
          onReorder={(cards) => {
            setMyCards(cards);
            state.game?.actions?.reorderMyCards({ order: cards });
          }}
        />
      </RFlex>
      <TableCards />
    </>
  );
};

const TableCards = () => {
  const { state } = useContext(GameContext)!;
  const cardWidth = 100;
  return (
    <Flex position="absolute">
      {state.game?.state?.players
        .filter((player) => !player?.isSelf)
        .map((player, i) => (
          <Box key={i} position="relative">
            <FlipMove>
              {player?.cards?.map((cardAlias) => (
                <Box
                  key={cardAlias}
                  sx={{ position: "relative", width: cardWidth / 2, display: "inline-block" }}
                >
                  <Box sx={{ position: "relative", width: cardWidth }}>
                    <PlayingCard card="back" width={cardWidth} />
                  </Box>
                </Box>
              ))}
            </FlipMove>
          </Box>
        ))}
    </Flex>
  );
};
