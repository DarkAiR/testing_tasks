import {autoinject} from 'aurelia-framework';
import {IAppearance, IUser} from "../interfaces";
import {AppearanceType} from "../enums";

@autoinject
export class UserService {
    async getUser(): Promise<IUser> {
        const appearance: IAppearance[] = [{
            type: AppearanceType.NOSE,
            value: '5'
        }, {
            type: AppearanceType.EYES,
            value: 'green'
        }, {
            type: AppearanceType.MOUTH,
            value: 'big'
        }];
        const name: string = this.generateRandomName(4);

        if (this.hasError()) {
            throw new Error('Error getting user');
        }
        return {
            name: 'name' + name,
            surname: 'sur' + this.generateRandomName(8),
            patronymic: 'part' + this.generateRandomName(3),

            address: this.generateRandomName(10) + ' str',
            email: 'name@test.com',
            appearance,
        }
    }

    private generateRandomName(len: number): string {
        return String.fromCharCode(...(new Array(len)).fill(0).map(() => {
            const code: number = ~~(Math.random() * 52);
            return code < 26 ? (65 + code) : (97 - 26 + code);
        }));
    }

    private hasError(): boolean {
        return Math.random() > 0.9;
    }
}
