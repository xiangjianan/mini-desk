import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";

describe("shadcn-vue primitives", () => {
  it("exports local source components used by the workbench shell", () => {
    const wrapper = mount({
      components: { Button, Badge, Separator },
      template: `
        <div>
          <Button variant="ghost" size="icon" aria-label="Icon action">A</Button>
          <Badge variant="secondary">已保存</Badge>
          <Separator />
        </div>
      `,
    });

    expect(wrapper.get("button").attributes("aria-label")).toBe("Icon action");
    expect(wrapper.text()).toContain("已保存");
    expect(wrapper.find('[data-slot="separator"]').exists()).toBe(true);
  });
});
