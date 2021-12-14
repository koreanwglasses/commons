import { Unpacked } from "@koreanwglasses/commons-beta/client";
import {
  Alert,
  Button,
  ButtonBase,
  CircularProgress,
  Collapse,
  Divider,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Layout } from "../components/layout";
import { Flex, RFlex } from "../components/flex";
import { FlexForm } from "../components/flex-form";
import SwipeableView from "react-swipeable-views";
import { User } from "../resources/user";
import {
  ContentCopy,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  Star,
  PlayArrow,
} from "@mui/icons-material";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Room } from "../resources/room";
import { EditableText } from "../components/editable-text";
import copy from "copy-to-clipboard";
import { Refresh } from "../components/refresh";
import { Game } from "../resources/game";
import { useRouter } from "next/dist/client/router";
import { useCommons, useQuery } from "@koreanwglasses/commons-beta/react";
import { ClientState } from "../resources/session";

const IndexContext = createContext<{
  setIndex: React.Dispatch<React.SetStateAction<number>>;
  setErr: React.Dispatch<React.SetStateAction<Error | null>>;
  state: Unpacked<ClientState>;
} | null>(null);

const Loader = () => {
  const state = useQuery<ClientState>("/api/app/state");

  const router = useRouter();
  useEffect(() => {
    if (state.result?.game) router.push("/game");
  }, [state.result?.game, router]);

  return (
    <Layout>
      <Paper elevation={6}>
        <Flex sx={{ width: 400, minHeight: 200, position: "relative" }}>
          {state.loading && <CircularProgress />}
          {!state.loading && state.result && <HomePage state={state.result} />}
        </Flex>
      </Paper>
    </Layout>
  );
};

export default Loader;

const HomePage = ({ state }: { state: Unpacked<ClientState> }) => {
  const [index, setIndex] = useState(
    state.room?.state?.players ? 2 : state.user?.state?.username ? 1 : 0
  );
  const [err, setErr] = useState<Error | null>(null);

  return (
    <IndexContext.Provider value={{ setIndex, setErr, state }}>
      <SwipeableView disabled index={index} animateHeight>
        <Slide0 />
        <Slide1 />
        <Slide2 />
      </SwipeableView>
      <Flex
        sx={{
          position: "absolute",
          height: 1,
          transform: "translateY(100%)",
          justifyContent: "start",
        }}
      >
        <Collapse in={!!err}>
          <Alert severity="error">{err?.message.split("\n")[0]}</Alert>
        </Collapse>
      </Flex>
    </IndexContext.Provider>
  );
};

const Slide0 = () => {
  const { state, setIndex, setErr } = useContext(IndexContext)!;
  return (
    <FlexForm
      action={state.user?.actions?.setUsername}
      onSubmit={(changed) => (changed ? setErr(null) : setIndex(1))}
      onSubmitted={(err) => {
        if (err) return setErr(err);
        setIndex(1);
      }}
    >
      <Flex gap={1}>
        <Typography>Enter a name</Typography>
        <TextField
          variant="standard"
          name="username"
          defaultValue={state.user?.state?.username ?? ""}
        />
        <Button type="submit">
          Next <KeyboardArrowRight />
        </Button>
      </Flex>
    </FlexForm>
  );
};

const Slide1 = () => {
  const { state, setIndex, setErr } = useContext(IndexContext)!;
  return (
    <Flex sx={{ p: 2 }} gap={1}>
      <Typography>Welcome, {state.user?.state?.username}</Typography>
      <Typography>Have a room code? Join a room!</Typography>
      <FlexForm
        action={"/api/room/join"}
        onSubmit={() => setErr(null)}
        onSubmitted={(err) => (err ? setErr(err) : setIndex(2))}
        submitUnchanged
      >
        <RFlex gap={1}>
          <TextField
            label="Room Code"
            name="joinCode"
            variant="standard"
            defaultValue={state.room?.state?.joinCode ?? ""}
          />
          <Button variant="outlined" type="submit">
            Join
          </Button>
        </RFlex>
      </FlexForm>
      <Typography>Or create a new one!</Typography>
      <FlexForm
        action={"/api/room/new"}
        onSubmit={() => setErr(null)}
        onSubmitted={(err) => (err ? setErr(err) : setIndex(2))}
        submitUnchanged
      >
        <Button variant="outlined" type="submit">
          New Room
        </Button>
      </FlexForm>
      <Button onClick={() => setIndex(0)}>
        <KeyboardArrowLeft />
        Back
      </Button>
    </Flex>
  );
};

const Slide2 = () => {
  const { setIndex, state } = useContext(IndexContext)!;
  return (
    <Flex sx={{ p: 2, height: 600 }} gap={1}>
      <FlexForm action={state.room?.actions?.setName}>
        <Typography variant="h6">
          <EditableText remoteValue={state.room?.state?.name} name="name" />
        </Typography>
      </FlexForm>
      <Divider flexItem variant="middle" sx={{ mb: 1 }}>
        <Typography variant="body2" sx={{ position: "relative", top: 10 }}>
          JOIN CODE
        </Typography>
      </Divider>
      {state.room && <JoinCode room={state.room} />}
      <Divider flexItem variant="middle" sx={{ mt: -1.5, mb: 1 }}>
        <Typography variant="body2" sx={{ position: "relative", top: 10 }}>
          PLAYERS {state.room?.state?.players.length}/6
        </Typography>
      </Divider>
      {state.room?.state?.players?.map((player, i) => (
        <Player key={i} player={player} />
      ))}
      <Divider flexItem sx={{ mt: 0.5 }} />
      <RFlex gap={1}>
        <Button
          onClick={() => {
            state.user?.actions?.leaveRoom()
            setIndex(1);
          }}
        >
          <KeyboardArrowLeft />
          Leave
        </Button>
        {state.room?.actions?.startGame && (
          <FlexForm action={state.room.actions.startGame} submitUnchanged>
            <Button
              variant="outlined"
              // disabled={(room.state?.members?.length ?? 0) < 6}
              type="submit"
            >
              Start
              <PlayArrow />
            </Button>
          </FlexForm>
        )}
      </RFlex>
    </Flex>
  );
};

function Player({
  player,
}: {
  player?: NonNullable<Unpacked<Room>["state"]>["players"][number];
}): JSX.Element {
  return (
    <RFlex
      gap={1}
      sx={{ opacity: player?.user?.state?.isConnected ? 1.0 : 0.5 }}
    >
      {player?.isHost && <Star fontSize="inherit" />}
      <FlexForm
        action={player?.isSelf ? player?.user?.actions?.setUsername : undefined}
      >
        <EditableText
          remoteValue={player?.user?.state?.username ?? "[Your Name]"}
          name="username"
        />
      </FlexForm>
      {!player?.user?.state?.isConnected && (
        <CircularProgress size={12} sx={{ color: "white" }} />
      )}
    </RFlex>
  );
}

function JoinCode({ room }: { room: Unpacked<Room> }) {
  return (
    <RFlex>
      <Tooltip title="Click to copy" followCursor>
        <ButtonBase
          sx={{
            bgcolor: "rgba(0,0,0,0.3)",
            borderRadius: 2,
            px: 1,
            py: 0.5,
            color: ({ palette }) => palette.secondary.main,
          }}
          onClick={() => {
            if (room.state?.joinCode) copy(room.state?.joinCode);
          }}
        >
          <code>{room.state?.joinCode}</code>
          <ContentCopy fontSize="inherit" sx={{ ml: 1 }} />
        </ButtonBase>
      </Tooltip>
      {room.actions?.newCode && (
        <Tooltip title="Regenerate Code" followCursor>
          <Refresh
            action={room.actions.newCode}
            size="small"
            sx={{ opacity: 0.5 }}
          />
        </Tooltip>
      )}
    </RFlex>
  );
}
