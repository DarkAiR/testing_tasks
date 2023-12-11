import {IAppearance} from "./IAppearance";

export interface IUser {
    name: string;
    surname: string;
    patronymic: string;

    address: string;
    email: string;
    appearance: IAppearance[];
}
