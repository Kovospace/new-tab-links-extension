
// class GroupComponent extends HTMLElement {
//     private group?: Group;
//     private unsubscribe?: () => void;
//
//     connectedCallback() {
//         this.unsubscribe = appStateDAO.subscribe(() => this.update());
//         this.update();
//     }
//
//     disconnectedCallback() {
//         this.unsubscribe?.();
//     }
//
//     update() {
//         const groupId = this.getAttribute("group-id");
//         if (!groupId) return;
//
//         this.group = appStateDAO.getState().groups[groupId];
//         this.render();
//     }
//
//     render() {
//         if (!this.group) return;
//
//         this.innerHTML = `
//       <div>
//         <h3>${this.group.title}</h3>
//
//         <button data-action="add-link">+ link</button>
//         <button data-action="delete-group">delete</button>
//
//         <ul>
//           ${this.group.items.map(item => {
//             if (item.type === "link") {
//                 const link = appStateDAO.getState().links[item.linkId];
//                 return `
//                 <li>
//                   <a href="${link.url}">${link.title}</a>
//                   <button data-action="delete-link" data-id="${link.id}">x</button>
//                 </li>
//               `;
//             }
//             return "";
//         }).join("")}
//         </ul>
//       </div>
//     `;
//
//         this.bindEvents();
//     }
//
//     bindEvents() {
//         this.querySelector('[data-action="add-link"]')
//             ?.addEventListener("click", () => {
//                 const title = prompt("Link title?");
//                 const url = prompt("URL?");
//                 if (title && url) {
//                     appStateDAO.createLink(this.group!.id, title, url);
//                 }
//             });
//
//         this.querySelector('[data-action="delete-group"]')
//             ?.addEventListener("click", () => {
//                 if (confirm("Delete group?")) {
//                     appStateDAO.deleteGroup(this.group!.id);
//                 }
//             });
//
//         this.querySelectorAll('[data-action="delete-link"]')
//             .forEach(btn =>
//                 btn.addEventListener("click", () => {
//                     const id = btn.getAttribute("data-id");
//                     if (id) {
//                         appStateDAO.deleteLink(this.group!.id, id);
//                     }
//                 })
//             );
//     }
// }
//
// customElements.define("link-group", GroupComponent);
