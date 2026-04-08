declare module "next/server" {
  export class NextRequest extends Request {
    nextUrl: URL;
  }

  export class NextResponse extends Response {
    static json(body: unknown, init?: ResponseInit): NextResponse;
  }
}
