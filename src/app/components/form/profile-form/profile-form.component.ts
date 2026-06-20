import {
  Component,
  Input,
  ChangeDetectionStrategy,
  forwardRef,
  Output,
  EventEmitter,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
} from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { FormSectionComponent } from "../form-section/form-section.component";
import { AvatarSelectorComponent } from "@components/avatar-selector/avatar-selector.component";
import { UnifiedFieldComponent } from "@components/fields/unified/unified-field.component";
import { TextField, TextareaField, TypeField } from "@entities/form-field.model";
export interface ProfileFormValue {
  name: string;
  last_name: string;
  bio: string;
  image_url: string;
}
@Component({
  selector: "app-profile-form",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    FormSectionComponent,
    AvatarSelectorComponent,
    UnifiedFieldComponent,
  ],
  templateUrl: "./profile-form.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ProfileFormComponent),
      multi: true,
    },
  ],
})
export class ProfileFormComponent implements ControlValueAccessor {
  @Input()
  get name(): string {
    return this._name;
  }
  set name(value: string) {
    this._name = value;
    if (this.nameFormControl) {
      this.nameFormControl.setValue(value, { emitEvent: false });
    }
  }
  @Input()
  get last_name(): string {
    return this._last_name;
  }
  set last_name(value: string) {
    this._last_name = value;
    if (this.lastNameFormControl) {
      this.lastNameFormControl.setValue(value, { emitEvent: false });
    }
  }
  @Input()
  get bio(): string {
    return this._bio;
  }
  set bio(value: string) {
    this._bio = value;
    if (this.bioFormControl) {
      this.bioFormControl.setValue(value, { emitEvent: false });
    }
  }
  @Input()
  get image_url(): string {
    return this._image_url;
  }
  set image_url(value: string) {
    this._image_url = value;
  }
  @Output() nameChange = new EventEmitter<string>();
  @Output() lastNameChange = new EventEmitter<string>();
  @Output() bioChange = new EventEmitter<string>();
  @Output() imageUrlChange = new EventEmitter<string>();
  private _name = "";
  private _last_name = "";
  private _bio = "";
  private _image_url = "/assets/images/avatars/avatar-1.svg";
  nameFormControl = new FormControl("");
  lastNameFormControl = new FormControl("");
  bioFormControl = new FormControl("");
  profileFormGroup = new FormGroup({
    name: this.nameFormControl,
    last_name: this.lastNameFormControl,
    bio: this.bioFormControl,
  });
  nameFieldDef: TextField = {
    name: "name",
    label: "First Name",
    type: TypeField.text,
    isShow: () => true,
  };
  lastNameFieldDef: TextField = {
    name: "last_name",
    label: "Last Name",
    type: TypeField.text,
    isShow: () => true,
  };
  bioFieldDef: TextareaField = {
    name: "bio",
    label: "Bio",
    type: TypeField.textarea,
    isShow: () => true,
  };
  private onChange: (value: ProfileFormValue) => void = () => {};
  private onTouched: () => void = () => {};
  writeValue(obj: ProfileFormValue): void {
    if (obj) {
      this._name = obj.name ?? "";
      this._last_name = obj.last_name ?? "";
      this._bio = obj.bio ?? "";
      this._image_url = obj.image_url ?? "/assets/images/avatars/avatar-1.svg";
      this.nameFormControl.setValue(this._name, { emitEvent: false });
      this.lastNameFormControl.setValue(this._last_name, { emitEvent: false });
      this.bioFormControl.setValue(this._bio, { emitEvent: false });
    }
  }
  registerOnChange(fn: (value: ProfileFormValue) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  onNameChange(value: string): void {
    this._name = value;
    this.nameChange.emit(value);
    this.emitChange();
  }
  onLastNameChange(value: string): void {
    this._last_name = value;
    this.lastNameChange.emit(value);
    this.emitChange();
  }
  onBioChange(value: string): void {
    this._bio = value;
    this.bioChange.emit(value);
    this.emitChange();
  }
  onImageUrlChange(value: string): void {
    this._image_url = value;
    this.imageUrlChange.emit(value);
    this.emitChange();
  }
  private emitChange(): void {
    this.onChange({
      name: this._name,
      last_name: this._last_name,
      bio: this._bio,
      image_url: this._image_url,
    });
    this.onTouched();
  }
}
