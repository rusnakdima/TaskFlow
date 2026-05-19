import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ChatMessageComponent } from "./chat-message.component";
import { ChatMessage } from "../../models/chat.model";

describe("ChatMessageComponent", () => {
  let component: ChatMessageComponent;
  let fixture: ComponentFixture<ChatMessageComponent>;

  const mockMessage: ChatMessage = {
    id: "msg-1",
    content: "Hello, world!",
    senderId: "user-1",
    senderName: "John Doe",
    senderAvatar: null,
    time: "2:34 PM",
    isMine: false,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatMessageComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatMessageComponent);
    component = fixture.componentInstance;
    component.message = mockMessage;
    component.isGroupStart = true;
    component.isGroupChat = false;
    component.editingMessageId = null;
    component.editingMessageContent = "";
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should display message content", () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain("Hello, world!");
  });

  it("should show sender name for group chat when isGroupStart is true", () => {
    component.isGroupChat = true;
    component.isGroupStart = true;
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain("John Doe");
  });

  it("should not show sender name for 1:1 chat", () => {
    component.isGroupChat = false;
    component.isGroupStart = true;
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).not.toContain("John Doe");
  });

  it("should emit contextMenu on right-click", () => {
    spyOn(component.contextMenu, "emit");
    const event = new MouseEvent("contextmenu", { bubbles: true });
    component.onContextMenu(event);
    expect(component.contextMenu.emit).toHaveBeenCalled();
  });

  it("should emit saveEdit when save button clicked in edit mode", () => {
    component.editingMessageId = "msg-1";
    fixture.detectChanges();
    spyOn(component.saveEdit, "emit");
    const saveButton = fixture.nativeElement.querySelector(".btn-save") as HTMLButtonElement;
    saveButton.click();
    expect(component.saveEdit.emit).toHaveBeenCalled();
  });
});
