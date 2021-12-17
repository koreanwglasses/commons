import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { Layout } from "../components/layout";
import { Flex, RFlex } from "../components/flex";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Card } from "../resources/game";
import { KeyboardArrowLeft } from "@mui/icons-material";
import { useRouter } from "next/dist/client/router";
import { CardHand } from "../components/playing-cards/cards-hand";
import { useQuery } from "@koreanwglasses/commons-beta/react";
import { Unpacked } from "@koreanwglasses/commons-beta/client";
import { AppState } from "../resources/app";
import { PlayingCard } from "../components/playing-cards/playing-card";
import FlipMove from "react-flip-move";

const GameContext = createContext<{
  state: Unpacked<AppState>;
} | null>(null);

const Loader = () => {
  const router = useRouter();

  const state = useQuery<AppState>("/api/app/state");

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
        <Flex position="absolute" left={0}>
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
  const cardWidth = 60;
  const handWidth = 200;
  const selfIndex =
    state.game?.state?.players.findIndex((player) => player?.isSelf) ?? 0;
  const R = 275;
  return (
    <Flex position="absolute">
      {state.game?.state?.players
        .filter((player) => !player?.isSelf)
        .map((player, i) => {
          const theta = ((i - selfIndex + 2.5) / 3) * Math.PI;
          return (
            <Box
              position="absolute"
              sx={{
                transform: `translate(${
                  1.3 * R * Math.cos(theta) - handWidth / 2
                }px, ${R * Math.sin(theta) - 100}px)`,
              }}
            >
              <Flex
                position="absolute"
                sx={{
                  width: handWidth,
                  transform: `translate(${
                    1.3 * 90 * Math.cos(theta)
                  }px, ${80 * Math.sin(theta) + 50}px)`,
                }}
              >
                <Typography variant="h6" component="div" sx={{fontSize: 16}}>
                  {player?.user?.state?.username ?? "[User Name]"}
                </Typography>
              </Flex>
              <Box
                key={i}
                position="absolute"
                width={handWidth}
                textAlign="center"
                sx={{
                  transform: `rotate(${theta + Math.PI / 2}rad)`,
                }}
              >
                <FlipMove>
                  {player?.cards?.map((cardAlias) => (
                    <Box
                      key={cardAlias}
                      sx={{
                        position: "relative",
                        maxWidth: cardWidth / 3,
                        display: "inline-block",
                      }}
                      style={{
                        width:
                          (handWidth - cardWidth) / (player.cards!.length - 1),
                      }}
                    >
                      <Box sx={{ position: "relative", width: cardWidth }}>
                        <PlayingCard card="back" width={cardWidth} />
                      </Box>
                    </Box>
                  ))}
                </FlipMove>
              </Box>
            </Box>
          );
        })}
    </Flex>
  );
};
