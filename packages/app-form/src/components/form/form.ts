import { BaseCreatePanel } from 'app/components/base-create-panel';
import { EventAggregator } from 'aurelia-event-aggregator';
import { autoinject, bindable, computedFrom, inject } from 'aurelia-framework';
import { I18N } from 'aurelia-i18n';
import { isDebugMode, state } from 'decorators';
import { EventAggregatorNames, PermissionEnum } from 'enums';
import { ButtonTheme, GridSize } from 'goodt-ui';
import { GtcDrawer } from 'goodt-ui/dist/components';
import { RequisitesHelper } from 'helpers/requisites-helper';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { CounterpartyService, OrgstructureService, RoleService, UserService } from 'services';
import { IUserUpdate } from 'interfaces/api/requests';
import { IUser } from 'interfaces/user';
import { IOrgstructureItem } from 'interfaces/orgstructure';
import { ISearchResult } from 'interfaces/search';
import { IRoleUrlParams } from '../../../../../interfaces/api/url-params';
import { UiCounterpartySelectionPanelCustomElement } from '../../../../components/ui/ui-counterparty-selection-panel/ui-counterparty-selection-panel';
import { UiOrgstructureSelectionPanelCustomElement } from '../../../../components/ui/ui-orgstructure-selection-panel/ui-orgstructure-selection-panel';
import { UiRoleSelectionPanelCustomElement } from '../../../../components/ui/ui-role-selection-panel/ui-role-selection-panel';

interface EditForm {
    name: string,
    surname: string,
    patronymic: string,
    email: string,
    phone: string,
    phone2: string,
    orgstructureElements: IOrgstructureItem[],
    counterparties: ISearchResult[],
    roles: ISearchResult[],
}

@autoinject
@state
export class UserEditCustomElement extends BaseCreatePanel<EditForm> {
    @bindable private user: IUser;

    ButtonTheme = ButtonTheme;
    GridSize = GridSize;

    loading: boolean = false;
    waiting: boolean = false;       // Флаг ожидания внешнего события (нр, выбора оргструктуры)
    rolesParams: IRoleUrlParams = {};

    private editPanel: GtcDrawer;
    private orgstructureSelection: UiOrgstructureSelectionPanelCustomElement;
    private counterpartySelection: UiCounterpartySelectionPanelCustomElement;
    private roleSelection: UiRoleSelectionPanelCustomElement;

    // @isDebugMode()
    // get isDebugMode(): boolean {
    //     return false;
    // }

    get hasRole(): boolean {
        return this.form?.roles?.length > 0 ?? false;
    }

    @computedFrom('formChanged')
    get isLocationDisabled(): boolean {
        return !this.hasRole;
    }

    @computedFrom('formChanged')
    get locationMessage(): string {
        if (!this.hasRole) {
            return this.i18n.tr('user.messages.role');
        }
        return '';
    }

    @computedFrom('formChanged')
    get counterpartyId(): number {
        return +(this.form.counterparties?.[0]?.id ?? 0);
    }

    @computedFrom('formChanged')
    get roleId(): number {
        return +(this.form.roles?.[0]?.id ?? 0);
    }

    constructor(
        private readonly counterpartyService: CounterpartyService,
        private readonly orgstructureService: OrgstructureService,
        private readonly roleService: RoleService,
        private readonly userService: UserService,
        private readonly eventAggregator: EventAggregator,
        private readonly i18n: I18N,
        @inject(Element) private readonly element: Element
    ) {
        super(element);
        this.clearForm();       // Т.к. окно создается перманентно, то форма должна быть инициализирована, иначе рендер упадет
    }

    async open() {
        await this.initForm();
        this.initRolesParams();
        await this.editPanel?.open();
    }

    async close() {
        this.closeOrgstructure();
        await this.closeCounterparties();
        await this.closeRoles();
        await this.editPanel.close();
    }

    async isOpen(): Promise<boolean> {
        return this.editPanel.isOpen();
    }

    async closeChildPanels(): Promise<boolean> {
        if (await this.counterpartySelection?.isOpen()) {
            await this.closeCounterparties();
            return true;
        }
        if (await this.roleSelection?.isOpen()) {
            await this.closeRoles();
            return true;
        }
        if (this.orgstructureSelection?.isOpen()) {
            this.closeOrgstructure();
            return true;
        }
        return false;
    }

    clearForm() {
        this.form = {
            name: '',
            surname: '',
            patronymic: '',
            email: '',
            phone: '',
            phone2: '',
            orgstructureElements: [],
            counterparties: [],
            roles: []
        };
        this.clearFormInvalidState();
    }

    async initForm() {
        this.loading = true;

        this.form = {
            name: this.user.name,
            surname: this.user.surname,
            patronymic: this.user.patronymic,
            email: this.user.email,
            phone: this.user.phone,
            phone2: this.user.phone2,
            orgstructureElements: await this.userService.fetchOrgstructure(this.user),
            counterparties: this.user.counterparty ? [this.counterpartyService.mapToSearchResult(this.user.counterparty)] : [],
            roles: this.user.role ? [this.roleService.mapToSearchResult(this.user.role)] : [],
        };
        this.formChanged++;

        this.loading = false;
    }

    async submit(form: EditForm): Promise<boolean> {
        // Т.к. role обязателен, то этот exception не особо нужен и стоит только для контроля за консистентностью кода
        if (!this.roleId) {
            throw new Error('role must be specified');
        }

        const userUpdateData: IUserUpdate = {
            name: form.name,
            surname: form.surname,
            patronymic: form.patronymic,
            phone: form.phone,
            phone2: form.phone2,
            email: form.email,

            ...(this.counterpartyId ? {counterparty_id: this.counterpartyId} : {}),
            role_id: this.roleId
        };

        const res: boolean = await this.userService.update(this.user, userUpdateData);
        if (!res) {
            return false;
        }
        if (await this.orgstructureService.updateOrgstructureAssignments(this.user, this.userService, [], this.form.orgstructureElements)) {
            this.eventAggregator.publish(EventAggregatorNames.MESSAGE, this.i18n.tr('orgstructure.success.change'));
        }
        return true;
    }

    validate(form: EditForm): boolean {
        this.clearFormInvalidState();

        const errorArray: [keyof EditForm, string][] = [];

        if (!form.surname) {
            this.formInvalidState.surname = true;
            errorArray.push([
                'surname',
                this.i18n.tr('error.emptyField', {field: this.i18n.tr('form.fio.surname')})
            ]);
        }

        if (!form.name) {
            this.formInvalidState.name = true;
            errorArray.push([
                'name',
                this.i18n.tr('error.emptyField', {field: this.i18n.tr('form.fio.name')})
            ]);
        }

        if (form.phone && !isValidPhoneNumber(form.phone, 'RU')) {
            this.formInvalidState.phone = true;
            errorArray.push([
                'phone',
                this.i18n.tr('error.incorrectField', {field: this.i18n.tr('form.phone')})
            ]);
        }

        if (form.phone2 && !isValidPhoneNumber(form.phone2, 'RU')) {
            this.formInvalidState.phone2 = true;
            errorArray.push([
                'phone2',
                this.i18n.tr('error.incorrectField', {field: this.i18n.tr('form.phone2')})
            ]);
        }

        if (!form.email) {
            this.formInvalidState.email = true;
            errorArray.push([
                'email',
                this.i18n.tr('error.emptyField', {field: this.i18n.tr('form.email')})
            ]);
        }
        if (form.email && !RequisitesHelper.checkEmail(form.email)) {
            this.formInvalidState.email = true;
            errorArray.push([
                'email',
                this.i18n.tr('error.incorrectField', {field: this.i18n.tr('form.email')})
            ]);
        }

        /**
         * Orgstructure
         */
        console.log('form', this.form);
        return false;
        if (!this.form.orgstructureElements.length) {
            this.formInvalidState.orgstructureElements = true;
            errorArray.push([
                'orgstructureElements',
                this.i18n.tr('error.emptyField', {field: this.i18n.tr('form.workarea')})
            ]);
        }

        /**
         * Roles
         */
        if (!this.form.roles.length) {
            this.formInvalidState.roles = true;
            errorArray.push([
                'roles',
                this.i18n.tr('error.emptyField', {field: this.i18n.tr('form.roles')})
            ]);
        }

        if (errorArray.length > 0) {
            this.eventAggregator.publish(EventAggregatorNames.TOAST_ERROR, errorArray[0][1]);
        }

        return errorArray.length === 0;
    }

    canEditRoleAndComponents(): boolean {
        return this.userService.checkAccess(PermissionEnum.USERS_UPDATE_ROLE_AND_COMPONENTS);
    }

    canEditUserPersonalData(): boolean {
        return this.userService.checkAccess(PermissionEnum.USERS_UPDATE_PERSONAL_DATA_BLOCKS);
    }

    canEditUserEmail(): boolean {
        return this.userService.checkAccess(PermissionEnum.USERS_UPDATE_EMAIL);
    }

    isCounterparty(): boolean {
        return this.userService.isCounterparty();
    }

    async onOpenRoles() {
        await this.openRoles();
    }

    onChangingRoles(event: CustomEvent) {
        this.form.roles = event.detail as ISearchResult[];
    }

    async onOpenCounterparties() {
        await this.openCounterparties();
    }

    onChangingCounterparties(event: CustomEvent) {
        this.form.counterparties = event.detail as ISearchResult[];
        this.form.roles.splice(0);      // Список ролей может поменяться
        this.initRolesParams();
    }

    async onAppendLocation(e: PointerEvent) {
        await this.openOrgstructure(e.y);
    }

    onRemoveLocation(event: CustomEvent) {
        this.form.orgstructureElements = event.detail;
        this.formInvalidState.orgstructureElements = false;
    }

    onOrgstructureSelected(event: CustomEvent) {
        this.form.orgstructureElements = event.detail;
        this.formInvalidState.orgstructureElements = false;
    }

    async onOrgstructureClose(event: CustomEvent) {
        event.stopPropagation();
        this.closeOrgstructure();
    }

    private initRolesParams() {
        this.rolesParams = {
            showOnlyAvailable: true,
            isCounterpartyFilled: this.isCounterparty()
                ? true
                : this.form.counterparties.length > 0
        };
    }

    private async openOrgstructure(y: number) {
        if (!this.orgstructureSelection.isOpen()) {
            this.waiting = true;
            this.orgstructureSelection.open(this.form.orgstructureElements, y, await this.editPanel.getBoundingRect());     // Открываем после отрисовки
        }
    }

    private closeOrgstructure() {
        this.orgstructureSelection?.close();
        this.waiting = false;
    }

    private async openRoles() {
        this.closeOrgstructure();
        await this.roleSelection.open();
    }

    private async closeRoles() {
        await this.roleSelection?.close();
    }

    private async openCounterparties() {
        this.closeOrgstructure();
        await this.counterpartySelection.open();
    }

    private async closeCounterparties() {
        await this.counterpartySelection?.close();
    }
}
