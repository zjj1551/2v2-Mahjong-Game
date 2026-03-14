import { _decorator } from 'cc';

export enum Suit {
    WAN = 0,
    TONG = 1,
    TIAO = 2
}

export class GameData {
    
    public static parseTile(tileId: number): { suit: Suit, point: number } {
        let suit: Suit;
        if (tileId >= 0 && tileId <= 8) {
            suit = Suit.WAN;
        } else if (tileId >= 9 && tileId <= 17) {
            suit = Suit.TONG;
        } else if (tileId >= 18 && tileId <= 26) {
            suit = Suit.TIAO;
        } else {
            console.error('Invalid tileId:', tileId);
            suit = Suit.WAN;
        }
        
        const point = (tileId % 9) + 1;
        return { suit, point };
    }

    public static getTileSpriteName(tileId: number): string {
        const { suit, point } = this.parseTile(tileId);
        let prefix = '';
        switch(suit) {
            case Suit.WAN: prefix = 'w'; break;
            case Suit.TONG: prefix = 'tong'; break;
            case Suit.TIAO: prefix = 'tiao'; break;
        }
        return prefix + '_' + point;
    }

    public static getRelativeSeat(mySeat: number, targetSeat: number): number {
        return (targetSeat - mySeat + 4) % 4;
    }
}