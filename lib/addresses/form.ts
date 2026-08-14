import type { AddressLabel, AddressRecord } from "@/types";

export interface AddressFormValues {
  label: AddressLabel;
  firstName: string;
  lastName: string;
  phone: string;
  addressLine: string;
  city: string;
  governorate: string;
  buildingNumber: string;
  floor: string;
  apartment: string;
  landmark: string;
  deliveryInstructions: string;
  postalCode: string;
}

export const EMPTY_ADDRESS_FORM: AddressFormValues = {
  label: "Home",
  firstName: "",
  lastName: "",
  phone: "",
  addressLine: "",
  city: "",
  governorate: "",
  buildingNumber: "",
  floor: "",
  apartment: "",
  landmark: "",
  deliveryInstructions: "",
  postalCode: "",
};

export function addressRecordToForm(address?: AddressRecord): AddressFormValues {
  if (!address) return { ...EMPTY_ADDRESS_FORM };
  return {
    label: address.label,
    firstName: address.firstName,
    lastName: address.lastName,
    phone: address.phone,
    addressLine: address.addressLine,
    city: address.city,
    governorate: address.governorate,
    buildingNumber: address.buildingNumber ?? "",
    floor: address.floor ?? "",
    apartment: address.apartment ?? "",
    landmark: address.landmark ?? "",
    deliveryInstructions: address.deliveryInstructions ?? "",
    postalCode: address.postalCode ?? "",
  };
}

export function formatAddressSnapshot(address: AddressFormValues): string {
  return [
    address.addressLine,
    address.buildingNumber && `Building ${address.buildingNumber}`,
    address.floor && `Floor ${address.floor}`,
    address.apartment && `Apartment ${address.apartment}`,
    address.landmark && `Landmark: ${address.landmark}`,
    address.postalCode && `Postal code: ${address.postalCode}`,
    address.deliveryInstructions && `Instructions: ${address.deliveryInstructions}`,
  ]
    .filter(Boolean)
    .join(", ");
}
