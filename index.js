import pngExtract from "png-chunks-extract"
import { spawn } from "node:child_process"
import { createInterface } from "readline"
import pngEncode from "png-chunks-encode"
import pngText from "png-chunk-text"
import path from "node:path"
import fs from "node:fs"

const p = spawn("powershell.exe", [`
  Add-Type -AssemblyName system.Windows.Forms
  $f = New-Object System.Windows.Forms.SaveFileDialog
  $f.InitialDirectory = [Environment]::GetFolderPath('ApplicationData') + '\\.minecraft\\resourcepacks'
  $f.Title = 'Select Folder - Enter a folder so it is selected and then click on Save'
  $f.FileName = 'Select Folder'
  $rc = $f.ShowDialog()
  if ($rc -eq [System.Windows.Forms.DialogResult]::OK)
  {
    $fn = $f.FileName.Replace('Select Folder', "")
  }
  echo $fn
`])

let data = ""
for await (const chunk of p.stdout) {
  data += chunk
}

const dir = data.trim()

if (!dir) process.exit()

if (dir.includes("�")) {
  const p = spawn("powershell.exe", [`
    Add-Type -AssemblyName PresentationCore,PresentationFramework
    [System.Windows.MessageBox]::Show('Unicode path detected. This program does not support unicode file paths. Please rename the folder to remove any unicode characters.')
  `])
  for await (const chunk of p.stdout) {}
  process.exit()
}

const p2 = spawn("powershell.exe", [`
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show('Are you sure you want to run Watermarker over this folder:\n\n${dir}', 'Confirmation', 'YesNo');
`])

let data2 = ""
for await (const chunk of p2.stdout) {
  data2 += chunk
}

if (data2.trim() === "No") process.exit()

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
})

const input = question => new Promise(fulfill => {
  rl.question(question, fulfill)
})

const author = await input("Enter author: ")

const getFiles = async function*(dir) {
  const dirents = await fs.promises.readdir(dir, { withFileTypes: true })
  for (const dirent of dirents) {
    const res = path.resolve(dir, dirent.name)
    if (dirent.isDirectory()) {
      yield* getFiles(res)
    } else {
      yield res
    }
  }
}

let x = 0
for await (const file of getFiles(dir)) {
  if (file.includes(".git") || !file.endsWith(".png")) continue
  const buffer = await fs.readFileSync(file)
  try {
    const chunks = pngExtract(buffer)
    const texts = chunks.filter(e => e.name === "tEXt")
    let found
    for (const text of texts) {
      const str = new TextDecoder().decode(text.data)
      if (str.split("\x00")[0] === "Author") {
        found = true
        console.log(`Skipping "${file.slice(dir.length)}" as it already has an author`)
      }
    }
    if (!found) {
      chunks.splice(1, 0, pngText.encode("Author", author))
      fs.writeFileSync(file, Buffer.from(pngEncode(chunks)))
      x++
    }
  } catch {
    console.log(`Failed to process: "${file.slice(dir.length)}"`)
  }
}

console.log(`Completed! the author has been added to ${x} files.`)
await input("Press Enter to continue...")