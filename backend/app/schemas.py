import json
import math
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

CONTRACT = json.loads(Path(__file__).with_name("contract.json").read_text())
HEROES = set(CONTRACT["heroes"])
Number = Annotated[float, Field(ge=0, le=1e150, allow_inf_nan=False)]
Count = Annotated[int, Field(ge=0, le=1_000_000_000, strict=True)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Volume(StrictModel):
    music: float = Field(ge=0, le=1)
    sfx: float = Field(ge=0, le=1)
    mute: bool
    master: float = Field(default=1, ge=0, le=1)
    off: dict[str, bool] = Field(default_factory=dict, max_length=20)


class Best(StrictModel):
    stage: Count
    level: Count
    time: Number


class Rate(StrictModel):
    silver: Number
    xp: Number


class Item(StrictModel):
    slot: Literal["weapon", "armour", "trinket"]
    g: int = Field(ge=0, le=3)
    pow: Number
    name: str = Field(max_length=160)
    sp: Literal["haste", "cdr", "leech", "ward", "silver", "crit"] | None = None
    spT: str | None = Field(default=None, max_length=160)


class Camp(StrictModel):
    whet: int = Field(ge=0, le=500)
    dress: int = Field(ge=0, le=500)
    oil: int = Field(ge=0, le=500)
    tonic: int = Field(ge=0, le=500)


def validate_party(value):
    if len(value) != 4 or len(set(value)) != 4 or not set(value) <= HEROES:
        raise ValueError("party must contain four distinct known heroes")
    return value


class Run(StrictModel):
    party: list[str]
    level: int = Field(ge=1, le=500)
    xp: Number
    silver: Number
    stage: int = Field(ge=1, le=500)
    maxStage: int = Field(ge=0, le=500)
    flames: int = Field(ge=0, le=3)
    time: Number
    camp: Camp
    cards: dict[str, int] = Field(max_length=40)
    gear: dict[str, dict[str, Item]] = Field(max_length=6)
    kills: Count
    lit: Count
    seed: int = Field(ge=-(2**31), lt=2**31)
    tonics: int = Field(ge=0, le=6)
    pack: int = Field(ge=0, le=3)
    holdCount: Count
    relics: Count
    silverMul: Number = 1
    maxTonics: int = Field(default=2, ge=0, le=6)
    d5: Count = 0

    _party = field_validator("party")(validate_party)

    @field_validator("cards")
    @classmethod
    def cards_valid(cls, value):
        if not set(value) <= set(CONTRACT["cards"]):
            raise ValueError("unknown card")
        if any(type(v) is not int or not 0 <= v <= 3 for v in value.values()):
            raise ValueError("invalid card rank")
        return value

    @field_validator("gear")
    @classmethod
    def gear_valid(cls, value):
        if not set(value) <= HEROES:
            raise ValueError("unknown equipment owner")
        for slots in value.values():
            if any(k not in {"weapon", "armour", "trinket"} or item.slot != k for k, item in slots.items()):
                raise ValueError("invalid equipment slot")
        return value


class Player(StrictModel):
    embers: Count
    boons: dict[str, int] = Field(max_length=10)
    unlocked: dict[str, int] = Field(max_length=6)
    best: Best
    runs: Count
    steward: bool
    push: bool
    speed: Literal[1, 2, 4]
    vol: Volume
    lastSeen: Number
    run: Run | None
    rate: Rate
    lastParty: list[str] | None = None
    pendingCards: int = Field(default=0, ge=0, le=500)
    atWaylight: bool = False

    @model_validator(mode="after")
    def validate_progress(self):
        if not set(self.unlocked) <= HEROES or any(type(v) is not int or v not in (0, 1) for v in self.unlocked.values()):
            raise ValueError("invalid unlocked heroes")
        if self.lastParty is not None:
            validate_party(self.lastParty)
        for key, rank in self.boons.items():
            if key not in CONTRACT["boons"] or type(rank) is not int or not 0 <= rank <= CONTRACT["boons"][key]:
                raise ValueError("invalid boon")
        if self.run and any(not self.unlocked.get(hero) for hero in self.run.party):
            raise ValueError("party contains locked heroes")
        return self


class Payload(StrictModel):
    schema_version: Literal[1] = 1
    player: Player

    @model_validator(mode="after")
    def finite_numbers(self):
        def check(value):
            if isinstance(value, float) and not math.isfinite(value):
                raise ValueError("non-finite save data")
            if isinstance(value, dict):
                for item in value.values():
                    check(item)
            elif isinstance(value, list):
                for item in value:
                    check(item)
        check(self.model_dump())
        return self


class Login(StrictModel):
    code: str = Field(min_length=1, max_length=256)


class Mutation(StrictModel):
    request_id: str = Field(pattern=r"^[a-zA-Z0-9_-]{16,64}$")
    revision: int = Field(ge=0)


class WriteSave(Mutation):
    payload: Payload


class RestoreSave(Mutation):
    source_revision: int = Field(ge=1)
