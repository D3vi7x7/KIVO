import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import AuthSectionOne from "@/components/ui/auth-section-1";

/**
 * Mirrors how the auth page wires the component: the parent owns the OTP
 * state and passes it back down as a prop.
 */
function Harness({ initialOtp = "" }: { initialOtp?: string }) {
  const [otp, setOtp] = useState(initialOtp);

  return (
    <AuthSectionOne
      onEmailSubmit={() => {}}
      otpSent
      otp={otp}
      onOtpChange={setOtp}
      onOtpSubmit={() => {}}
    />
  );
}

describe("AuthSectionOne OTP field", () => {
  it("keeps every typed character in the OTP input", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByLabelText("OTP") as HTMLInputElement;

    await user.click(input);
    await user.type(input, "257205");

    expect(input).toHaveValue("257205");
  });

  it("does not clear the field when focus returns to it", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByLabelText("OTP") as HTMLInputElement;

    await user.click(input);
    await user.type(input, "25");
    expect(input).toHaveValue("25");

    // Blur and focus again, as a user correcting a typo would.
    await user.tab();
    await user.click(input);
    await user.type(input, "7");

    expect(input).toHaveValue("257");
  });

  it("keeps a pre-filled OTP when the field is focused", async () => {
    const user = userEvent.setup();
    render(<Harness initialOtp="123456" />);

    const input = screen.getByLabelText("OTP") as HTMLInputElement;

    expect(input).toHaveValue("123456");

    await user.click(input);
    expect(input).toHaveValue("123456");

    await user.type(input, "7");
    expect(input).toHaveValue("1234567");
  });

  it("lets the user clear a pre-filled OTP", async () => {
    const user = userEvent.setup();
    render(<Harness initialOtp="123456" />);

    const input = screen.getByLabelText("OTP") as HTMLInputElement;

    await user.click(input);
    await user.clear(input);

    expect(input).toHaveValue("");
  });
});
