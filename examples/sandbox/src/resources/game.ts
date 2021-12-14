import { Cascade } from "@koreanwglasses/cascade";
import {
  ACCESS_ALLOW,
  ACCESS_DENY,
  Client,
  Collection,
  Model,
  NOT_FOUND,
  Resource,
} from "@koreanwglasses/commons-core";

import { MongoSupplier, store } from "../backend/database";
import { session } from "./session";
import { User, Users } from "./user";

///////////////////////
// TYPE DECLARATIONS //
///////////////////////

export type Game = Resource<GameModel>;
export type Games = Collection<GameModel>;

export type Card = `${
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "9"
  | "T"
  | "J"
  | "Q"
  | "K"
  | "A"}${"C" | "H" | "S" | "D"}`;

type Fields = {
  _id: string;
  _players: {
    id: string;
    cards: Card[];
  }[];
  _activePlayerId: string;
  _cardAliases: Partial<Record<Card, string>>;
};

type Queries = {
  players(): {
    user: User;
    cards: string[];
    isSelf: boolean;
    isActive: boolean;
  }[];
  myCards(): Card[];
};

type Actions = {
  _init(playerIds: string[]): string;
  reorderMyCards(body: { order: Card[] }): void;
};

type GameModel = Model<Fields, Queries, Actions>;

////////////
// CONSTS //
////////////

//////////////
// POLICIES //
//////////////

function PLAYERS_ONLY(this: Games, target: Game | null, client: Client) {
  if (!target) return ACCESS_DENY;

  return Cascade.$({ players: target.$._players, ...session(client).$ }).$(
    ($) =>
      $.players.find(({ id }) => id === $.session.userId)
        ? ACCESS_ALLOW
        : ACCESS_DENY
  );
}

//////////////////////
// MODEL DEFINITION //
//////////////////////

const model: GameModel = {
  name: "Game",

  fields: {
    _id: {
      type: String,
    },
    _players: {
      type: [{ id: String, cards: [String] }],
    },
    _activePlayerId: {
      type: String,
    },
    _cardAliases: {
      type: {},
    },
  },

  queries: {
    players: {
      policy: PLAYERS_ONLY,
      autoFetch: true,
      get({ target, client }) {
        return Cascade.$({
          activePlayerId: target.$._activePlayerId,
          players: target.$._players,
          cardAliases: target.$._cardAliases,
          ...session(client).$,
        }).$(($) =>
          Cascade.all(
            $.players.map((player) =>
              Cascade.$({ user: Users.$[player.id] }).$(({ user }) => {
                return {
                  user,
                  cards: player.cards.map((card) => $.cardAliases[card]!),
                  isSelf: player.id === $.session.userId,
                  isActive: player.id === $.activePlayerId,
                };
              })
            )
          )
        );
      },
    },
    myCards: {
      policy: PLAYERS_ONLY,
      autoFetch: true,
      get({ target, client }) {
        return Cascade.$({
          players: target.$._players,
          ...session(client).$,
        }).$(($) => $.players.find(({ id }) => id === $.session.userId)!.cards);
      },
    },
  },

  actions: {
    _init: {
      isStatic: true,
      async exec(_, playerIds) {
        // if (playerIds.length < 6)
        //   throw new Error("Not enough players");

        const hands = deal();

        const gameId = (
          await GameStore.create({
            _players: playerIds.map((id, i) => ({
              id,
              cards: hands[i],
            })),
            _cardAliases: Object.fromEntries(
              playerIds
                .map((_, i) => hands[i].map((card, j) => [card, `${i},${j}`]))
                .flat()
            ),
          })
        ).id;

        return gameId;
      },
    },
    reorderMyCards: {
      policy: PLAYERS_ONLY,
      async exec({ target, client }, { order }) {
        const game = await GameStore.findById(target.id).exec();
        if (!game) throw NOT_FOUND();

        const { userId } = await session(client).$.session.next();
        const player = game._players.find(({ id }) => id === userId)!;

        const cards = player.cards;

        if (cards.sort().join(",") !== [...order].sort().join(",")) {
          throw new Error("Cards do not match");
        }

        player.cards = order;
        await game.save();

        return { notify: target.handle("/players?") };
      },
    },
  },
};

////////////////////
// STATIC HELPERS //
////////////////////

function deal() {
  const cards = [..."2345679TJQKA"]
    .map((rank) => [..."CHSD"].map((suit) => rank + suit))
    .flat() as Card[];

  // Shuffle
  for (let i = 0; i < cards.length; i++) {
    const swap = (i: number, j: number) => {
      [cards[i], cards[j]] = [cards[j], cards[i]];
    };

    const j = Math.floor(i + Math.random() * (cards.length - i));
    swap(i, j);
  }

  // Split
  const hands: Card[][] = [];
  for (let i = 0; i < 6; i++) {
    hands.push(cards.slice(i * 8, (i + 1) * 8));
  }
  return hands;
}

///////////
// STORE //
///////////

export const GameStore = store(model);
export const Games = MongoSupplier.collection(model);
