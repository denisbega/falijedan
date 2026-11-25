/** Greška poslovnog pravila ili validacije — server je vraća klijentu kao { error } sa HTTP statusom. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
