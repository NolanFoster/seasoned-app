export class EmailMessage {
  public from: string;
  public to: string;
  public raw: string;

  constructor(from: string, to: string, raw: string) {
    this.from = from;
    this.to = to;
    this.raw = raw;
  }
}
