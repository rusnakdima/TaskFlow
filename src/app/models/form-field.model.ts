export enum TypeField {
  text = "text",
  number = "number",
  textarea = "textarea",
  image = "image",
  select = "select",
  checkbox = "checkbox",
  radio = "radio",
  datepicker = "datepicker",
  slidetoggle = "slidetoggle",
  slider = "slider",
  sliderrange = "sliderrange",
  menu = "menu",
  subgroup = "subgroup",
  sublist = "sublist",
}

interface CommonFormField {
  label: string | ((param: any) => string);
  name: string;
  readonly?: boolean;
  isShow: (param: any, index?: number) => boolean;
}

export interface OptionData {
  value: any;
  label: string;
  isShow: (param: any, index?: number) => boolean;
}

export function parseArrayOptions(array: any[], keyLabel: string, keyValue: string): OptionData[] {
  return array.map((item) => {
    return {
      value: item[keyValue],
      label: item[keyLabel],
      isShow: (param: any, index?: number) => true,
    } as OptionData;
  });
}

export function parseEnumOptions(enumType: any): OptionData[] {
  return Object.entries(enumType).map((value: any) => {
    return {
      value: value[1],
      label: String(value[1]).slice(0, 1).toLocaleUpperCase() + String(value[1]).slice(1),
      isShow: (param: any, index?: number) => true,
    } as OptionData;
  });
}

export interface TextField extends CommonFormField {
  type: TypeField.text;
}
export interface NumberField extends CommonFormField {
  type: TypeField.number;
  min: number;
}
export interface TextareaField extends CommonFormField {
  type: TypeField.textarea;
}
export interface ImageField extends CommonFormField {
  type: TypeField.image;
}
export interface SelectField extends CommonFormField {
  type: TypeField.select;
  options: Array<OptionData>;
}
export interface CheckboxField extends CommonFormField {
  type: TypeField.checkbox;
}
export interface RadioField extends CommonFormField {
  type: TypeField.radio;
  options?: Array<OptionData>;
}
export interface DatePickerField extends CommonFormField {
  type: TypeField.datepicker;
}
export interface SlideToggleField extends CommonFormField {
  type: TypeField.slidetoggle;
}
export interface SliderField extends CommonFormField {
  type: TypeField.slider;
  min: number;
  max: number;
}
export interface SliderRangeField extends CommonFormField {
  type: TypeField.sliderrange;
  min: number;
  max: number;
}
export interface MenuField extends CommonFormField {
  type: TypeField.menu;
  direction: "vertical" | "horizontal";
  value: any;
  subGroup: Array<FormField>;
}
export interface SubGroupField extends CommonFormField {
  type: TypeField.subgroup;
  direction: "vertical" | "horizontal";
  subGroup: Array<FormField>;
}
export interface SubListField extends CommonFormField {
  type: TypeField.sublist;
  subList: Array<FormField>;
}

export type FormField =
  | TextField
  | NumberField
  | TextareaField
  | ImageField
  | SelectField
  | CheckboxField
  | RadioField
  | DatePickerField
  | SlideToggleField
  | SliderField
  | SliderRangeField
  | MenuField
  | SubGroupField
  | SubListField;
